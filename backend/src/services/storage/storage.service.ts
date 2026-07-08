import crypto from 'crypto';
import path from 'path';
import prisma from '../../config/prisma.js';
import { ApiError } from '../../utils/ApiError.js';
import { normalizeSpaces } from '../../utils/sanitize.js';
import { auditLog } from '../../modules/audit/audit.service.js';
import { checkOwnership } from '../../middleware/ownership.js';
import { cloudinaryStorageProvider } from './cloudinary-storage.service.js';
import { gcpStorageProvider } from './gcp-storage.service.js';

export type StorageProviderName = 'cloudinary' | 'gcp';
export type StorageResourceType = 'image' | 'raw';

export type FileUploadContext = {
  ownerId: number;
  ownerRole: string;
  entityType: string;
  entityId?: number | null;
  purpose?: string;
  ipAddress?: string;
  userAgent?: string;
};

export type StorageUploadInput = {
  buffer: Buffer;
  key: string;
  folder: string;
  mimeType: string;
  resourceType: StorageResourceType;
  context: FileUploadContext;
};

export type StorageUploadResult = {
  provider: StorageProviderName;
  bucket?: string;
  key: string;
  url?: string;
};

export type StorageProvider = {
  name: StorageProviderName;
  uploadFile(input: StorageUploadInput): Promise<StorageUploadResult>;
  deleteFile(key: string, resourceType?: StorageResourceType): Promise<void>;
  getSignedUrl(key: string, options: { resourceType: StorageResourceType; expiresInSeconds: number; mimeType?: string }): Promise<string>;
};

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const allowedByExtension: Record<string, string[]> = {
  '.pdf': ['application/pdf'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
  '.doc': ['application/msword'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.xls': ['application/vnd.ms-excel'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.csv': ['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain']
};

const blockedExtensions = new Set([
  '.exe', '.dll', '.bat', '.cmd', '.com', '.scr', '.ps1', '.vbs', '.js', '.jar',
  '.msi', '.sh', '.php', '.html', '.htm', '.svg'
]);

const sanitizeOriginalName = (name: string) =>
  normalizeSpaces(path.basename(name || 'file')).replace(/[^\w.\- ()]/g, '_').slice(0, 180) || 'file';

const extensionForMime = (mimeType: string) => {
  if (mimeType === 'application/pdf') return '.pdf';
  if (mimeType === 'image/jpeg') return '.jpg';
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'application/msword') return '.doc';
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return '.docx';
  if (mimeType === 'application/vnd.ms-excel') return '.xls';
  if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return '.xlsx';
  if (['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain'].includes(mimeType)) return '.csv';
  return '.bin';
};

const detectMagicMime = (buffer: Buffer, declaredMime?: string): string | null => {
  if (buffer.subarray(0, 4).equals(Buffer.from([0x25, 0x50, 0x44, 0x46]))) return 'application/pdf';
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    const archiveIndex = buffer.toString('latin1');
    if (archiveIndex.includes('[Content_Types].xml') || archiveIndex.includes('word/')) {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
    if (archiveIndex.includes('xl/')) {
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
    return null;
  }
  if (buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) {
    return declaredMime === 'application/vnd.ms-excel' ? 'application/vnd.ms-excel' : 'application/msword';
  }
  const sample = buffer.subarray(0, Math.min(buffer.length, 512)).toString('utf8');
  if (/^[\u0009\u000a\u000d\u0020-\u007e]+$/.test(sample) && sample.includes(',')) return 'text/csv';
  return null;
};

const containsExecutableSignature = (buffer: Buffer) => {
  if (buffer.subarray(0, 2).toString('ascii') === 'MZ') return true;
  const sample = buffer.subarray(0, Math.min(buffer.length, 512)).toString('utf8').toLowerCase();
  return sample.includes('<svg') || sample.includes('<script') || sample.includes('<?php');
};

export const validateFile = (file: Express.Multer.File) => {
  if (!file) throw new ApiError(400, 'File is required', 'FILE_REQUIRED');
  if (!file.buffer?.length) throw new ApiError(400, 'Uploaded file is empty', 'FILE_EMPTY');
  if (file.size > MAX_FILE_BYTES) throw new ApiError(400, 'File exceeds maximum size', 'FILE_TOO_LARGE');

  const originalName = sanitizeOriginalName(file.originalname);
  const ext = path.extname(originalName).toLowerCase();
  if (!ext || blockedExtensions.has(ext)) throw new ApiError(400, 'File type is not allowed', 'FILE_EXTENSION_BLOCKED');

  const allowedMimes = allowedByExtension[ext];
  if (!allowedMimes) throw new ApiError(400, 'File extension is not allowed', 'FILE_EXTENSION_NOT_ALLOWED');
  if (!allowedMimes.includes(file.mimetype)) throw new ApiError(400, 'File MIME type does not match extension', 'FILE_MIME_MISMATCH');
  if (containsExecutableSignature(file.buffer)) throw new ApiError(400, 'Unsafe file content detected', 'FILE_EXECUTABLE_SIGNATURE');

  const magicMime = detectMagicMime(file.buffer, file.mimetype);
  if (!magicMime || !allowedMimes.includes(magicMime)) {
    if (ext === '.csv' && magicMime === 'text/csv' && allowedMimes.includes(file.mimetype)) {
      const checksum = crypto.createHash('sha256').update(file.buffer).digest('hex');
      const secureName = `${crypto.randomUUID()}.csv`;
      return {
        originalName,
        secureName,
        extension: '.csv',
        mimeType: file.mimetype === 'application/vnd.ms-excel' ? 'text/csv' : magicMime,
        size: file.size,
        checksum,
        resourceType: 'raw' as StorageResourceType
      };
    }
    throw new ApiError(400, 'File signature does not match allowed file type', 'FILE_MAGIC_MISMATCH');
  }

  const checksum = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const safeExtension = extensionForMime(magicMime);
  const secureName = `${crypto.randomUUID()}${safeExtension}`;
  const resourceType: StorageResourceType = magicMime.startsWith('image/') ? 'image' : 'raw';

  return {
    originalName,
    secureName,
    extension: safeExtension,
    mimeType: magicMime,
    size: file.size,
    checksum,
    resourceType
  };
};

const scanFileForMalware = async (_file: Express.Multer.File) => {
  // Placeholder for ClamAV/GCP malware scanning integration. Fail closed here when a scanner is configured.
  return { clean: true };
};

const providerFor = (name: StorageProviderName): StorageProvider =>
  name === 'gcp' ? gcpStorageProvider : cloudinaryStorageProvider;

const isPublicCatalogueAsset = async (fileAssetId: number) => {
  const [productImage, certification] = await Promise.all([
    prisma.productImage.findFirst({
      where: { fileAssetId, product: { status: 'ACTIVE' as any } },
      select: { id: true }
    }).catch(() => null),
    prisma.certification.findFirst({
      where: {
        fileAssetId,
        OR: [
          { product: { status: 'ACTIVE' as any } },
          { service: { status: 'ACTIVE' as any } }
        ]
      },
      select: { id: true }
    }).catch(() => null)
  ]);
  return Boolean(productImage || certification);
};

export const canAccessFileAsset = async (asset: any, user: { id: number; role: string }) => {
  if (user.role === 'admin' || user.role === 'master_admin') return true;
  if (asset.ownerId === user.id) return true;
  if (['catalogue', 'catalogue_product', 'catalogue_service'].includes(asset.entityType) || await isPublicCatalogueAsset(asset.id)) return true;
  if (!asset.entityId) return false;

  if (asset.entityType === 'tender') return checkOwnership('tender', asset.entityId, user);
  if (asset.entityType === 'bid') return checkOwnership('bid', asset.entityId, user);
  if (asset.entityType === 'quote') return checkOwnership('quote', asset.entityId, user);
  if (asset.entityType === 'procurement_checkout') return asset.ownerId === user.id;
  if (asset.entityType === 'procurement_bid') {
    const doc = await prisma.procurementBidDocument.findFirst({
      where: { fileAssetId: asset.id },
      include: { bid: true }
    });
    if (!doc) return false;
    if (doc.visibility === 'PUBLIC') return true;
    if (user.role === 'buyer' && doc.bid.buyerId === user.id) return true;
    if (user.role === 'seller' && doc.visibility === 'SELLER_AFTER_LOGIN') return true;
    return false;
  }
  if (['procurement_bid_participation', 'procurement_participation_document', 'procurement_financial_quote'].includes(asset.entityType)) {
    const doc = await prisma.procurementBidParticipationDocument.findFirst({
      where: { fileAssetId: asset.id },
      include: { participation: { include: { bid: true } } }
    });
    if (!doc) return false;
    const bid = doc.participation.bid;
    if (user.role === 'seller') return doc.sellerId === user.id;
    if (user.role === 'buyer') {
      if (bid.buyerId !== user.id) return false;
      if (doc.documentCategory !== 'FINANCIAL_QUOTE') {
        return ['CLOSED', 'EXPIRED', 'TECHNICAL_EVALUATION', 'TECHNICAL_EVALUATION_COMPLETED', 'FINANCIAL_EVALUATION', 'L1_GENERATED', 'AWARD_RECOMMENDED', 'AWARDED'].includes(bid.status);
      }
      return doc.participation.technicalStatus === 'QUALIFIED' && ['FINANCIAL_EVALUATION', 'L1_GENERATED', 'AWARD_RECOMMENDED', 'AWARDED'].includes(bid.status);
    }
    return false;
  }
  if (['procurement_bid_clarification', 'procurement_clarification_file'].includes(asset.entityType)) {
    const file = await prisma.procurementBidClarificationFile.findFirst({
      where: { fileAssetId: asset.id },
      include: { clarification: { include: { bid: true } } }
    });
    if (!file) return false;
    if (user.role === 'seller') return file.clarification.sellerId === user.id;
    if (user.role === 'buyer') return file.clarification.bid.buyerId === user.id;
    return false;
  }
  if (['procurement_award_document', 'procurement_evaluation_report'].includes(asset.entityType)) {
    return false;
  }
  if (['procurement_delivery_document', 'procurement_invoice'].includes(asset.entityType)) {
    const deliveryDoc = await prisma.deliveryDocument.findFirst({
      where: { fileAssetId: asset.id },
      include: { deliveryTracking: { include: { purchaseOrder: true } } }
    }).catch(() => null);
    const invoice = deliveryDoc ? null : await prisma.invoice.findFirst({
      where: { OR: [{ invoiceFileId: asset.id }, { fileAssetId: asset.id }] },
      include: { purchaseOrder: true }
    }).catch(() => null);
    const po = deliveryDoc?.deliveryTracking?.purchaseOrder || invoice?.purchaseOrder;
    if (!po) return asset.ownerId === user.id;
    if (user.role === 'seller') return po.sellerId === user.id;
    if (user.role === 'buyer') return po.buyerId === user.id;
    return false;
  }

  const messageAttachment = await prisma.messageAttachment.findFirst({
    where: { fileAssetId: asset.id },
    include: { message: { include: { conversation: { select: { buyerId: true, sellerId: true } } } } }
  });
  if (messageAttachment?.message?.conversation) {
    const conv = messageAttachment.message.conversation;
    if (user.role === 'admin' || user.role === 'master_admin') return true;
    return conv.buyerId === user.id || conv.sellerId === user.id;
  }

  if (asset.entityType === 'message' && asset.entityId) {
    const message = await prisma.message.findUnique({
      where: { id: asset.entityId },
      include: { conversation: { select: { buyerId: true, sellerId: true } } }
    });
    if (message?.conversation) {
      if (user.role === 'admin' || user.role === 'master_admin') return true;
      return message.conversation.buyerId === user.id || message.conversation.sellerId === user.id;
    }
  }

  return false;
};

export const uploadFile = async (
  file: Express.Multer.File,
  context: FileUploadContext,
  providerName: StorageProviderName = 'cloudinary'
) => {
  const validation = validateFile(file);
  const scan = await scanFileForMalware(file);
  if (!scan.clean) throw new ApiError(400, 'File failed malware scan', 'FILE_MALWARE_DETECTED');

  const folder = `msme/${context.entityType || 'general'}/${context.ownerId}`;
  const key = validation.resourceType === 'image'
    ? validation.secureName.replace(path.extname(validation.secureName), '')
    : validation.secureName;
  const provider = providerFor(providerName);
  const result = await provider.uploadFile({
    buffer: file.buffer,
    key,
    folder,
    mimeType: validation.mimeType,
    resourceType: validation.resourceType,
    context
  });

  const asset = await prisma.fileAsset.create({
    data: {
      ownerId: context.ownerId,
      ownerRole: context.ownerRole,
      entityType: context.entityType,
      entityId: context.entityId || null,
      storageProvider: result.provider,
      bucket: result.bucket,
      key: result.key,
      url: result.url,
      mimeType: validation.mimeType,
      size: validation.size,
      checksum: validation.checksum,
      originalName: validation.originalName,
      status: 'active'
    }
  });

  void auditLog({
    actorUserId: context.ownerId,
    actorRole: context.ownerRole,
    action: 'file.uploaded',
    entityType: 'file',
    entityId: asset.id,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    metadata: {
      fileId: asset.id,
      relatedEntityType: context.entityType,
      relatedEntityId: context.entityId,
      mimeType: asset.mimeType,
      size: asset.size,
      checksum: asset.checksum
    }
  }).catch(err => console.warn('[Audit] file.uploaded failed:', err?.message || err));

  return asset;
};

export const getSignedUrl = async (fileId: number, user: { id: number; role: string }, request?: { ipAddress?: string; userAgent?: string }) => {
  const asset = await prisma.fileAsset.findUnique({ where: { id: fileId } });
  if (!asset || asset.status !== 'active') throw new ApiError(404, 'File not found', 'FILE_NOT_FOUND');

  if (!(await canAccessFileAsset(asset, user))) {
    await auditLog({
      actorUserId: user.id,
      actorRole: user.role,
      action: asset.entityType?.startsWith('procurement') ? 'procurement.file_access_denied' : 'file.access_denied',
      entityType: 'file',
      entityId: asset.id,
      ipAddress: request?.ipAddress,
      userAgent: request?.userAgent
    });
    throw new ApiError(404, 'File not found', 'FILE_NOT_FOUND');
  }

  const provider = providerFor(asset.storageProvider as StorageProviderName);
  const signedUrl = await provider.getSignedUrl(asset.key, {
    resourceType: asset.mimeType.startsWith('image/') ? 'image' : 'raw',
    expiresInSeconds: 5 * 60,
    mimeType: asset.mimeType
  });

  await auditLog({
    actorUserId: user.id,
    actorRole: user.role,
    action: asset.entityType?.startsWith('procurement') ? 'procurement.file_viewed' : 'file.viewed',
    entityType: 'file',
    entityId: asset.id,
    ipAddress: request?.ipAddress,
    userAgent: request?.userAgent
  });

  return { asset, signedUrl, expiresInSeconds: 5 * 60 };
};

export const getFileContent = async (fileId: number, user: { id: number; role: string }, request?: { ipAddress?: string; userAgent?: string }) => {
  const signed = await getSignedUrl(fileId, user, request);
  const response = await fetch(signed.signedUrl);

  if (!response.ok) {
    throw new ApiError(502, 'Unable to retrieve stored file', 'FILE_STORAGE_FETCH_FAILED');
  }

  return {
    ...signed,
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: signed.asset.mimeType || response.headers.get('content-type') || 'application/octet-stream'
  };
};

export const deleteFile = async (fileId: number, user: { id: number; role: string }, request?: { ipAddress?: string; userAgent?: string }) => {
  const asset = await prisma.fileAsset.findUnique({ where: { id: fileId } });
  if (!asset || asset.status !== 'active') throw new ApiError(404, 'File not found', 'FILE_NOT_FOUND');

  if (!(await canAccessFileAsset(asset, user)) || (user.role !== 'admin' && asset.ownerId !== user.id)) {
    await auditLog({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'file.delete_denied',
      entityType: 'file',
      entityId: asset.id,
      ipAddress: request?.ipAddress,
      userAgent: request?.userAgent
    });
    throw new ApiError(404, 'File not found', 'FILE_NOT_FOUND');
  }

  const provider = providerFor(asset.storageProvider as StorageProviderName);
  await provider.deleteFile(asset.key, asset.mimeType.startsWith('image/') ? 'image' : 'raw');
  const updated = await prisma.fileAsset.update({
    where: { id: fileId },
    data: { status: 'deleted' }
  });

  await auditLog({
    actorUserId: user.id,
    actorRole: user.role,
    action: 'file.deleted',
    entityType: 'file',
    entityId: asset.id,
    ipAddress: request?.ipAddress,
    userAgent: request?.userAgent
  });

  return updated;
};
