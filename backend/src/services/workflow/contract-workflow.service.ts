import { ApiError } from '../../utils/ApiError.js';
import { sha256 } from '../../utils/crypto.js';
import { auditWorkflow, db, numberSeries, type WorkflowActor } from './workflow-common.js';

export const contractWorkflow = {
  async createAfterAward(actor: WorkflowActor, input: Record<string, unknown>) {
    const tenderId = Number(input.tenderId || 0);
    const bidId = Number(input.bidId || 0);
    if (tenderId) {
      const tender = await db.tender.findUnique({ where: { id: tenderId } });
      if (!tender || (actor.role !== 'admin' && tender.buyerId !== actor.id)) throw new ApiError(404, 'Tender not found', 'TENDER_NOT_FOUND');
      if (!['awarded', 'po_generated', 'closed'].includes(String(tender.status))) {
        throw new ApiError(409, 'Contract can be created only after award', 'CONTRACT_AWARD_REQUIRED');
      }
    }
    const contract = await db.contract.create({
      data: {
        contractNumber: numberSeries('CTR'),
        tenderId: tenderId || null,
        bidId: bidId || null,
        title: String(input.title || 'Procurement contract'),
        value: input.value || 0,
        contractType: input.contractType || 'PURCHASE',
        status: 'DRAFT',
        startDate: input.startDate,
        endDate: input.endDate,
        metadata: input.metadata
      }
    });
    await auditWorkflow(actor, 'workflow.contract.created_after_award', 'contract', contract.id);
    return contract;
  },

  async uploadDocument(actor: WorkflowActor, contractId: number, file: Express.Multer.File) {
    const contract = await db.contract.findUnique({ where: { id: contractId }, include: { tender: true } });
    if (!contract || (actor.role !== 'admin' && contract.tender?.buyerId !== actor.id)) throw new ApiError(404, 'Contract not found', 'CONTRACT_NOT_FOUND');
    const asset = await db.fileAsset.create({
      data: {
        ownerId: actor.id,
        ownerRole: actor.role,
        entityType: 'contract',
        entityId: contractId,
        storageProvider: 'local',
        key: `contracts/${contractId}/${Date.now()}-${file.originalname}`,
        mimeType: file.mimetype,
        size: file.size,
        checksum: sha256(file.buffer.toString('base64')),
        originalName: file.originalname,
        status: 'active'
      }
    });
    await auditWorkflow(actor, 'workflow.contract.document_uploaded', 'fileAsset', asset.id, { contractId });
    return asset;
  }
};
