import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDebounce } from "../hooks/useDebounce";
import { api } from "../lib/api";
import { formatDate, formatDateTime } from "../features/shared/format";
import { Button } from "../components/ui/button";
import { Pagination } from "../features/shared/Pagination";
import { useResponsiveViewMode } from "../features/shared/hooks";
import { ViewModeToggle } from "../features/shared/ViewModeToggle";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Badge,
} from "../components/ui/card";
import { Tabs } from "../components/ui/tabs";
import { Input } from "../components/ui/input";
import { toast } from "sonner";
import { getFileAssetPreview, type DocumentPreview } from "../lib/files";
import { DocumentPreviewModal } from "../components/DocumentPreviewModal";
import {
  Search,
  Eye,
  CheckCircle,
  XCircle,
  Users,
  ShoppingBag,
  X,
  FileText,
  Check,
  ShieldCheck,
  MapPin,
  Building2,
  Briefcase,
  AlertTriangle,
  Download,
  Filter,
  Clock,
  BarChart3,
  ClipboardCheck,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  LayoutGrid,
  List,
} from "lucide-react";
import { cn } from "../lib/utils";

const SELLER_ONBOARDING_DOCUMENT_TYPES = new Set([
  "pan_copy",
  "bank_passbook",
  "address_proof",
  "udyam_certificate",
  "gst_certificate",
  "aadhaar_card",
  "business_registration_proof",
  "dipp_certificate",
  "itr_3_years",
  "nsic_certificate",
  "leader_aadhaar",
  "member_list",
  "registration_certificate",
  "training_certificate",
  "product_photos",
]);

const getDocumentFiles = (document: any) => {
  if (!document) return [];
  return Array.isArray(document) ? document.filter(Boolean) : [document];
};

const getDocumentUrl = (document: any) =>
  typeof document === "string"
    ? document
    : document?.url || document?.signedUrl || document?.fileAsset?.url || (document?.fileId ? `/api/files/${document.fileId}/view` : "");

const DOCUMENT_LABELS: Record<string, string> = {
  panCard: "PAN_COPY",
  regCert: "REGISTRATION_CERTIFICATE",
  gstCert: "GST_CERTIFICATE",
  addressProof: "ADDRESS_PROOF",
  authLetter: "AUTHORIZATION_LETTER",
  uploaded_files: "UPLOADED_FILES",
  leader_aadhaar: "GROUP_LEADER_AADHAAR_CARD",
  member_list: "MEMBER_LIST",
  registration_certificate: "SHG_REGISTRATION_CERTIFICATE",
  training_certificate: "TRAINING_SKILL_CERTIFICATE",
  product_photos: "PRODUCT_PHOTOS_CATALOGUE",
};

const getDocumentLabel = (key: string) =>
  DOCUMENT_LABELS[key] || String(key || "DOCUMENT").replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[\s-]+/g, "_").toUpperCase();

const getDocumentFileName = (file: any, fallback: string) =>
  file?.originalName || file?.fileAsset?.originalName || file?.name || file?.fileName || fallback;

const getDocumentUploadedAt = (file: any) =>
  file?.uploadedAt || file?.createdAt || file?.fileAsset?.createdAt || file?.file?.createdAt || null;

const getSellerOnboardingDocuments = (profile: any) => {
  const sellerDocuments = Array.isArray(profile?.sellerDocuments)
    ? profile.sellerDocuments.filter((doc: any) =>
      SELLER_ONBOARDING_DOCUMENT_TYPES.has(String(doc?.documentType || "")) && Boolean(doc?.fileAsset),
    )
    : [];

  const legacyDocuments =
    profile?.documents && typeof profile.documents === "object" && !Array.isArray(profile.documents)
      ? Object.entries(profile.documents).filter(([key, value]) => {
        if (!SELLER_ONBOARDING_DOCUMENT_TYPES.has(String(key))) return false;
        if (!getDocumentFiles(value).some(getDocumentUrl)) return false;
        return !sellerDocuments.some(
          (doc: any) => String(doc.documentType).toLowerCase() === String(key).toLowerCase(),
        );
      })
      : [];

  return { sellerDocuments, legacyDocuments };
};

const MSME_TYPE_LABELS: Record<string, string> = {
  MSME: 'MSME',
  NON_MSME: 'Non-MSME',
  LOCAL_MSME: 'Local MSME',
  ANCILLARY_UNIT: 'Ancillary Unit',
  STARTUP_MSME: 'Startup MSME'
};

const VENDOR_TYPE_LABELS: Record<string, string> = {
  MANUFACTURER: 'Manufacturer',
  TRADER: 'Trader',
  DISTRIBUTOR: 'Distributor',
  DEALER: 'Dealer',
  SERVICE_PROVIDER: 'Service Provider',
  CONTRACTOR: 'Contractor',
  OEM: 'OEM',
  RETAIL_SUPPLIER: 'Retail Supplier',
  WHOLESALER: 'Wholesaler'
};

const REGISTRATION_TYPE_LABELS: Record<string, string> = {
  GST_REGISTERED: 'GST Registered',
  UDYAM_REGISTERED: 'UDYAM Registered',
  NSIC_REGISTERED: 'NSIC Registered',
  ISO_CERTIFIED: 'ISO Certified',
  PAN_AVAILABLE: 'PAN Available'
};

export default function AdminOnboarding() {
  const queryClient = useQueryClient();
  const token = typeof window !== 'undefined' ? localStorage.getItem("token") || "" : "";
  const authHeaders = { Authorization: `Bearer ${token}` };
  const authOptions = {
    headers: { Authorization: `Bearer ${token}` },
  };

  const [sellers, setSellers] = useState<any[]>([]);
  const [buyers, setBuyers] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("sellers");
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 400);

  const [statusFilter, setStatusFilter] = useState("all");
  const [progressFilter, setProgressFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [adminView, setAdminView] = useState("applications");
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [previewDocument, setPreviewDocument] = useState<DocumentPreview | null>(null);
  const [feedback, setFeedback] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(10);

  // Rejection Modal State
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [activeSectionForRejection, setActiveSectionForRejection] =
    useState("");
  const [rejectionReason, setRejectionReason] = useState("");

  // Override Modal State
  const [isOverrideModalOpen, setIsOverrideModalOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  // View / Toolbar UI state
  const [viewMode, setViewMode] = useResponsiveViewMode();
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // 1. Fetch KPI stats (shares key and cache with dashboard/MISReports)
  const { data: adminStats, isLoading: isAdminStatsLoading } = useQuery({
    queryKey: ['adminStats'],
    queryFn: async () => {
      const res = await api.fetch('/api/admin/reports/summary?kpiOnly=true', { headers: authHeaders });
      if (!res.ok) throw new Error('Failed to fetch stats');
      const json = await res.json();
      return json?.data ?? json;
    },
    enabled: !!token,
    staleTime: 5 * 60_000,
  });

  // 2. Fetch registrations list query
  const { data: onboardingData, isLoading: isOnboardingLoading } = useQuery({
    queryKey: ['adminOnboardingList'],
    queryFn: async () => {
      const res = await api.fetch("/api/admin/onboarding", authOptions);
      if (!res.ok) throw new Error("Failed to load onboarding records");
      const json = await res.json();
      return json?.data ?? json;
    },
    enabled: !!token,
    staleTime: 5 * 60_000,
  });

  const isLoading = isOnboardingLoading;

  useEffect(() => {
    if (onboardingData) {
      setSellers(Array.isArray(onboardingData.sellers) ? onboardingData.sellers : []);
      setBuyers(Array.isArray(onboardingData.buyers) ? onboardingData.buyers : []);
    }
  }, [onboardingData]);

  /**
   * Open the scrutiny modal with the heavy detail (full profile, offices,
   * banks, certs, docs) already in place so review data appears instantly.
   *
   * Detail is fetched from /admin/onboarding/:id, but we cache every fetched
   * record in `detailCacheRef` and prefetch the visible rows (and on hover),
   * so by the time a reviewer clicks "Review" the data is usually already
   * resident — the modal renders complete immediately with no spinner/flash.
   * If the cache misses, we still show the lightweight row instantly and merge
   * the detail in as soon as it lands.
   */
  const detailCacheRef = useRef<Map<string, any>>(new Map());
  const inFlightRef = useRef<Map<string, Promise<any>>>(new Map());

  const fetchDetail = useCallback(async (item: any): Promise<any> => {
    const key = String(item._id || item.id);
    if (!key) return null;
    if (detailCacheRef.current.has(key)) return detailCacheRef.current.get(key);
    if (inFlightRef.current.has(key)) return inFlightRef.current.get(key);

    const promise = (async () => {
      try {
        const res = await api.fetch(`/api/admin/onboarding/${key}`, { ...authOptions, skipCache: true });
        if (!res.ok) return null;
        const payload = await res.json();
        const detail = payload?.data || payload;
        if (detail) detailCacheRef.current.set(key, detail);
        return detail;
      } catch {
        return null;
      } finally {
        inFlightRef.current.delete(key);
      }
    })();

    inFlightRef.current.set(key, promise);
    return promise;
  }, [authOptions]);

  // Warm the cache without opening the modal (hover / visible rows).
  const prefetchDetail = useCallback((item: any) => {
    const key = String(item?._id || item?.id || "");
    if (!key || detailCacheRef.current.has(key) || inFlightRef.current.has(key)) return;
    void fetchDetail(item);
  }, [fetchDetail]);

  const openItemForReview = async (item: any) => {
    const key = String(item._id || item.id);
    setFeedback(item.adminFeedback || "");

    // If detail is already cached, render the complete record immediately.
    const cached = detailCacheRef.current.get(key);
    if (cached) {
      setSelectedItem({ ...item, ...cached });
      return;
    }

    // Otherwise show the lightweight row instantly, then merge detail in.
    setSelectedItem(item);
    const detail = await fetchDetail(item);
    if (detail) {
      setSelectedItem((prev: any) =>
        prev && (prev._id === item._id || prev._id === item.id || prev.id === item.id)
          ? { ...prev, ...detail }
          : prev,
      );
    }
  };

  useEffect(() => {
    return () => {
      if (previewDocument?.url?.startsWith("blob:")) URL.revokeObjectURL(previewDocument.url);
    };
  }, [previewDocument?.url]);

  const handleUpdateStatus = async (
    userId: string,
    status: string,
    customOverrideReason?: string,
  ) => {
    if (!selectedItem || selectedItem._id !== userId) return;

    const selectedFlags = selectedItem.complianceViolations || [];
    let reason = "";
    if (
      status === "approved_for_procurement" &&
      selectedFlags.some((flag: any) =>
        ["medium", "high", "critical"].includes(flag.severity),
      )
    ) {
      if (customOverrideReason === undefined) {
        // Open override modal and stop execution to await user input
        setIsOverrideModalOpen(true);
        setOverrideReason("");
        return;
      }
      reason = customOverrideReason;
      if (!reason.trim()) {
        toast.error("Admin override reason is required for flagged approvals");
        return;
      }
    }

    // 1. Keep a backup of the previous state
    const previousSelectedItem = { ...selectedItem };
    const previousSellers = [...sellers];
    const previousBuyers = [...buyers];

    // 2. Compute the new state optimistically
    const isBuyer = selectedItem.role === "buyer";
    const buyerKeys = ["org", "rep", "address", "procurement", "docs"];
    const sellerKeys = [
      "pan",
      "details",
      "additional",
      "offices",
      "bank",
      "ownership",
      "documents",
    ];
    const keys = isBuyer ? buyerKeys : sellerKeys;

    let updatedSectionStatus = selectedItem.sectionStatus;
    if (status === "approved_for_procurement") {
      updatedSectionStatus = Object.fromEntries(keys.map((k) => [k, "approved"]));
    } else if (status === "rejected") {
      updatedSectionStatus = Object.fromEntries(keys.map((k) => [k, "rejected"]));
    }

    const updatedItem = {
      ...selectedItem,
      onboardingStatus: status,
      sectionStatus: updatedSectionStatus,
      adminFeedback: reason || selectedItem.adminFeedback,
    };

    // 3. Apply optimistic state updates
    setSelectedItem(updatedItem);

    const updateListItem = (prevList: any[]) =>
      prevList.map((item) =>
        item._id === userId
          ? {
            ...item,
            onboardingStatus: status,
            sectionStatus: updatedSectionStatus,
            adminFeedback: reason || item.adminFeedback,
          }
          : item,
      );

    if (isBuyer) {
      setBuyers(updateListItem);
    } else {
      setSellers(updateListItem);
    }

    // Close override modal instantly if open
    setIsOverrideModalOpen(false);
    setOverrideReason("");

    // 4. Make the backend API request
    try {
      const numericId = Number(userId) || selectedItem?.id;
      const res = await api.post(
        `/api/admin/onboarding/${numericId}/status`,
        { onboardingStatus: status, adminFeedback: reason || undefined },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        },
      );
      if (res.ok) {
        const responseBody = await res.json().catch(() => ({} as any));
        const payload = responseBody?.data || responseBody;
        const organization = payload?.organization;
        const organizationMeta = organization
          ? {
            organization,
            organizationId: organization.id,
            organizationAutoCreated: Boolean(payload?.organizationCreated),
            organizationVerified: organization.verificationStatus === "VERIFIED",
          }
          : {};
        const successMessage = status === "approved_for_procurement"
          ? `Application approved and organization created/verified successfully.${organization?.organizationName ? ` Organization: ${organization.organizationName} (#${organization.id}).` : ""}`
          : `Complete application ${status}`;
        toast.success(successMessage);

        if (organization) {
          setSelectedItem((prev: any) => prev && (prev._id === userId || prev.id === numericId)
            ? { ...prev, ...organizationMeta, onboardingStatus: status, sectionStatus: updatedSectionStatus }
            : prev);
          const applyOrganizationMeta = (prevList: any[]) =>
            prevList.map((item) => item._id === userId || item.id === numericId
              ? { ...item, ...organizationMeta, onboardingStatus: status, sectionStatus: updatedSectionStatus }
              : item);
          if (isBuyer) setBuyers(applyOrganizationMeta);
          else setSellers(applyOrganizationMeta);
        }
        // Keep the warmed detail cache in sync so reopening the modal shows
        // the new status instantly instead of stale cached detail.
        const cacheKey = String(userId);
        const cachedDetail = detailCacheRef.current.get(cacheKey);
        if (cachedDetail) {
          detailCacheRef.current.set(cacheKey, {
            ...cachedDetail,
            ...organizationMeta,
            onboardingStatus: status,
            sectionStatus: updatedSectionStatus,
            adminFeedback: reason || cachedDetail.adminFeedback,
          });
        }
        queryClient.invalidateQueries({ queryKey: ['adminOnboardingList'] });
        queryClient.invalidateQueries({ queryKey: ['adminStats'] });
      } else {
        const errBody = await res.json().catch(() => ({} as any));
        const detail = errBody?.message || errBody?.error || `HTTP ${res.status}`;
        toast.error(`Failed to update status: ${detail}`);
        if (typeof window !== 'undefined') {
          console.error('[AdminOnboarding] status update failed', { status: res.status, body: errBody });
        }
        // Revert to original state
        detailCacheRef.current.delete(String(userId));
        setSelectedItem(previousSelectedItem);
        setSellers(previousSellers);
        setBuyers(previousBuyers);
      }
    } catch (err) {
      toast.error("Network error");
      console.error('[AdminOnboarding] status network error', err);
      // Revert to original state
      detailCacheRef.current.delete(String(userId));
      setSelectedItem(previousSelectedItem);
      setSellers(previousSellers);
      setBuyers(previousBuyers);
    }
  };

  const handleUpdateSectionStatus = async (
    userId: string,
    section: string,
    status: string,
    reason?: string,
  ) => {
    if (!selectedItem || selectedItem._id !== userId) return;

    // 1. Keep a backup of the previous state
    const previousSelectedItem = { ...selectedItem };
    const previousSellers = [...sellers];
    const previousBuyers = [...buyers];

    // 2. Define default status map based on the role
    const defaultStatusMap = selectedItem.role === "buyer"
      ? {
        org: "pending",
        rep: "pending",
        address: "pending",
        procurement: "pending",
        docs: "pending",
      }
      : {
        pan: "pending",
        details: "pending",
        additional: "pending",
        offices: "pending",
        bank: "pending",
        ownership: "pending",
        documents: "pending",
      };

    // 3. Compute updated sectionStatus
    const updatedSectionStatus = {
      ...(selectedItem.sectionStatus || defaultStatusMap),
      [section]: status,
    };

    // 4. Compute onboardingStatus
    // Skip non-section meta keys like `submitted` that the seller-side
    // /onboarding/submit endpoint stores in sectionStatus.
    const sectionKeys = selectedItem.role === "buyer"
      ? ["org", "rep", "address", "procurement", "docs"]
      : ["pan", "details", "additional", "offices", "bank", "ownership", "documents"];
    const statuses = sectionKeys.map((k) => updatedSectionStatus[k as keyof typeof updatedSectionStatus] || "pending");
    let newStatus = "under_compliance_review";
    if (statuses.every((s) => s === "approved")) {
      newStatus = "approved_for_procurement";
    } else if (statuses.some((s) => s === "rejected")) {
      newStatus = "rejected";
    } else if (statuses.some((s) => s === "resubmission_required")) {
      newStatus = "resubmission_required";
    }

    // 5. Update rejection reasons
    const updatedRejectionReasons = reason
      ? {
        ...(selectedItem.sectionRejectionReasons || {}),
        [section]: reason,
      }
      : (selectedItem.sectionRejectionReasons || {});

    const updatedItem = {
      ...selectedItem,
      onboardingStatus: newStatus,
      sectionStatus: updatedSectionStatus,
      sectionRejectionReasons: updatedRejectionReasons,
    };

    // 6. Apply optimistic state updates
    setSelectedItem(updatedItem);

    const updateListItem = (prevList: any[]) =>
      prevList.map((item) =>
        item._id === userId
          ? {
            ...item,
            onboardingStatus: newStatus,
            sectionStatus: updatedSectionStatus,
            sectionRejectionReasons: updatedRejectionReasons,
          }
          : item,
      );

    if (selectedItem.role === "buyer") {
      setBuyers(updateListItem);
    } else {
      setSellers(updateListItem);
    }

    // 7. Make the backend API request
    try {
      // Strip non-section meta keys before sending so backend computation
      // stays consistent and we don't accidentally persist stale flags.
      const cleanSectionStatus: Record<string, string> = {};
      for (const k of sectionKeys) {
        cleanSectionStatus[k] = String(updatedSectionStatus[k as keyof typeof updatedSectionStatus] || "pending");
      }
      // Coerce userId to a number for the URL — backend's idParams uses
      // z.coerce.number().int().positive() but we send what we have. Use the
      // fallback to selectedItem.id (numeric) so even if _id was a string we
      // still hit the right route.
      const numericId = Number(userId) || selectedItem?.id;
      const res = await api.post(
        `/api/admin/onboarding/${numericId}/section-status`,
        {
          sectionStatus: cleanSectionStatus,
          sectionRejectionReasons: updatedRejectionReasons,
        },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        },
      );
      if (res.ok) {
        toast.success(`${section} status updated to ${status}`);
        // Keep prefetch cache in sync
        const cacheKey = String(userId);
        const cachedDetail = detailCacheRef.current.get(cacheKey);
        if (cachedDetail) {
          detailCacheRef.current.set(cacheKey, {
            ...cachedDetail,
            onboardingStatus: newStatus,
            sectionStatus: updatedSectionStatus,
            sectionRejectionReasons: updatedRejectionReasons,
          });
        }
        queryClient.invalidateQueries({ queryKey: ['adminOnboardingList'] });
        queryClient.invalidateQueries({ queryKey: ['adminStats'] });
      } else {
        // Try to surface the actual server message so reviewers know what
        // went wrong instead of seeing the generic "failed to update".
        const errBody = await res.json().catch(() => ({} as any));
        const detail = errBody?.message || errBody?.error || `HTTP ${res.status}`;
        toast.error(`Failed to update section status: ${detail}`);
        if (typeof window !== 'undefined') {
          console.error('[AdminOnboarding] section-status update failed', { status: res.status, body: errBody });
        }
        // Revert to original state
        detailCacheRef.current.delete(String(userId));
        setSelectedItem(previousSelectedItem);
        setSellers(previousSellers);
        setBuyers(previousBuyers);
      }
    } catch (err) {
      toast.error("Network error");
      console.error('[AdminOnboarding] section-status network error', err);
      // Revert to original state
      detailCacheRef.current.delete(String(userId));
      setSelectedItem(previousSelectedItem);
      setSellers(previousSellers);
      setBuyers(previousBuyers);
    }
  };

  const handleConfirmRejection = async () => {
    if (!selectedItem || !activeSectionForRejection) return;

    await handleUpdateSectionStatus(
      selectedItem._id,
      activeSectionForRejection,
      "rejected",
      rejectionReason,
    );

    // Reset and close modal
    setIsRejectModalOpen(false);
    setActiveSectionForRejection("");
    setRejectionReason("");
  };

  const openRejectionModal = (section: string) => {
    setActiveSectionForRejection(section);
    setIsRejectModalOpen(true);
  };

  const handleViewDocument = async (fileAsset: any, label: string) => {
    try {
      setPreviewDocument(await getFileAssetPreview(fileAsset, label));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to open document");
    }
  };

  const handleSendFeedback = async () => {
    if (!selectedItem || !feedback.trim()) return;
    try {
      const res = await api.post(
        "/api/admin/feedback",
        { userId: selectedItem._id, feedback },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        },
      );
      if (res.ok) {
        toast.success("Feedback sent to stakeholder");
        setSelectedItem({ ...selectedItem, adminFeedback: feedback });
      } else {
        toast.error("Failed to send feedback");
      }
    } catch (err) {
      toast.error("Network error");
    }
  };

  const getStatusBadge = (onboardingStatus: string) => {
    switch (onboardingStatus) {
      case "approved_for_procurement":
        return (
          <Badge
            variant="success"
            className="rounded-full px-4 border-2 border-green-100 shadow-sm font-black uppercase text-[9px] tracking-widest"
          >
            Approved for Procurement
          </Badge>
        );
      case "rejected":
        return (
          <Badge
            variant="error"
            className="rounded-full px-4 border-2 border-red-100 shadow-sm font-black uppercase text-[9px] tracking-widest"
          >
            Rejected
          </Badge>
        );
      case "resubmission_required":
        return (
          <Badge
            variant="warning"
            className="rounded-full px-4 border-2 border-amber-100 shadow-sm font-black uppercase text-[9px] tracking-widest text-amber-700 bg-amber-50"
          >
            Resubmission Required
          </Badge>
        );
      case "under_compliance_review":
      case "manual_review_required":
        return (
          <Badge
            variant="warning"
            className="rounded-full px-4 border-2 border-slate-100 shadow-sm font-black uppercase text-[9px] tracking-widest text-[#12335f] bg-slate-50"
          >
            {onboardingStatus === "manual_review_required" ? "Manual Review Required" : "Under Compliance Review"}
          </Badge>
        );
      case "verified":
        return (
          <Badge
            variant="success"
            className="rounded-full px-4 border-2 border-indigo-100 shadow-sm font-black uppercase text-[9px] tracking-widest text-indigo-700 bg-indigo-50"
          >
            Verified
          </Badge>
        );
      case "pending_validation":
        return (
          <Badge
            variant="warning"
            className="rounded-full px-4 border-2 border-slate-100 shadow-sm font-black uppercase text-[9px] tracking-widest text-slate-700 bg-slate-50"
          >
            Pending Validation
          </Badge>
        );
      default:
        return (
          <Badge
            variant="warning"
            className="rounded-full px-4 border-2 border-slate-100 shadow-sm font-black uppercase text-[9px] tracking-widest text-slate-700 bg-slate-50"
          >
            {onboardingStatus || "Pending"}
          </Badge>
        );
    }
  };

  const getSections = (item: any) =>
    item.role === "buyer"
      ? ["org", "rep", "address", "procurement", "docs"]
      : [
        "pan",
        "details",
        "additional",
        "offices",
        "bank",
        "ownership",
        "documents",
      ];

  const getProgress = (item: any) => {
    if (!item?.sectionStatus) return 0;
    const sections = getSections(item);
    const count = sections.filter(
      (section) => item.sectionStatus?.[section] === "approved",
    ).length;
    return Math.round((count / sections.length) * 100);
  };

  const getDisplayText = (value: unknown, fallback: string) => {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return fallback;
  };
  // Pull the registered entity name from whichever profile the user has.
  // Returns empty string if onboarding hasn't started yet, so the table can
  // render a clear "Onboarding in progress" placeholder instead of "N/A".
  const getEntityName = (item: any): string => {
    const profile = item?.profile || {};
    const candidate = profile.businessName
      || profile.organizationName
      || profile.officeZoneName
      || (typeof item?.organization === "object" ? item.organization?.legalName || item.organization?.name : "");
    return typeof candidate === "string" ? candidate.trim() : "";
  };
  // Combine city + state when present. Empty string when neither exists, so
  // the caller can hide the row instead of printing "STATE N/A".
  const getEntityLocation = (item: any): string => {
    const profile = item?.profile || {};
    const parts = [profile.city, profile.state]
      .filter((part) => typeof part === "string" && part.trim().length > 0)
      .map((part) => String(part).trim());
    return parts.join(", ");
  };
  const getPrimaryCategory = (item: any) => {
    const category =
      item.role === "buyer"
        ? item.profile?.procurementCategories?.[0]
        : Array.isArray(item.profile?.productCategories)
          ? item.profile.productCategories[0]
          : item.profile?.industry;

    return getDisplayText(
      category,
      item.role === "buyer" ? "General Procurement" : "Manufacturing",
    );
  };
  const getSubmittedDate = (item: any) => {
    const d = new Date(item.createdAt || Date.now());
    return Number.isNaN(d.getTime()) ? new Date() : d;
  };
  const isPendingStatus = (status: string) =>
    ["pending", "pending_validation", "manual_review_required", "under_compliance_review"].includes(
      status,
    );

  const filterData = (data: any[]) => {
    const term = debouncedSearchTerm.trim().toLowerCase();
    return data
      .filter((item) => {
        const name = (item.name || "").toLowerCase();
        const company = getEntityName(item).toLowerCase();
        const gst = (item.profile?.gst || "").toLowerCase();
        const pan = (item.profile?.pan || "").toLowerCase();
        const state = (item.profile?.state || "").toLowerCase();
        const status = item.onboardingStatus || "pending";
        const progress = getProgress(item);
        const matchesSearch =
          !term ||
          name.includes(term) ||
          company.includes(term) ||
          gst.includes(term) ||
          pan.includes(term) ||
          state.includes(term);
        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "pending" && isPendingStatus(status)) ||
          (statusFilter === "approved" &&
            status === "approved_for_procurement") ||
          (statusFilter === "rejected" && status === "rejected") ||
          (statusFilter === "resubmission" &&
            status === "resubmission_required");
        const matchesProgress =
          progressFilter === "all" ||
          (progressFilter === "not_started" && progress === 0) ||
          (progressFilter === "in_progress" &&
            progress > 0 &&
            progress < 100) ||
          (progressFilter === "complete" && progress === 100);
        return matchesSearch && matchesStatus && matchesProgress;
      })
      .sort((a, b) => {
        if (sortBy === "oldest")
          return getSubmittedDate(a).getTime() - getSubmittedDate(b).getTime();
        if (sortBy === "newest")
          return getSubmittedDate(b).getTime() - getSubmittedDate(a).getTime();

        if (sortBy === "progress") return getProgress(b) - getProgress(a);
        if (sortBy === "progress_asc") return getProgress(a) - getProgress(b);

        if (sortBy === "entity")
          return getEntityName(a).localeCompare(getEntityName(b));
        if (sortBy === "entity_desc")
          return getEntityName(b).localeCompare(getEntityName(a));

        if (sortBy === "status")
          return String(a.onboardingStatus || "").localeCompare(String(b.onboardingStatus || ""));
        if (sortBy === "status_desc")
          return String(b.onboardingStatus || "").localeCompare(String(a.onboardingStatus || ""));

        if (sortBy === "category")
          return getPrimaryCategory(a).localeCompare(getPrimaryCategory(b));
        if (sortBy === "category_desc")
          return getPrimaryCategory(b).localeCompare(getPrimaryCategory(a));

        return getSubmittedDate(b).getTime() - getSubmittedDate(a).getTime();
      });
  };

  const currentData =
    activeTab === "sellers" ? filterData(sellers) : filterData(buyers);
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(currentData.length / pageSize)),
  );
  const pagedCurrentData = currentData.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const setPageSize = (nextPageSize: number) => {
    setPageSizeState(nextPageSize);
    setPage(1);
  };

  // Warm the detail cache for the rows currently on screen so opening the
  // scrutiny modal is instant. Runs whenever the visible page changes.
  // Prefetches are de-duped and capped per pass to avoid hammering the API.
  useEffect(() => {
    if (pagedCurrentData.length === 0) return;
    const timer = setTimeout(() => {
      pagedCurrentData.slice(0, pageSize).forEach(prefetchDetail);
    }, 150);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, currentPage, pageSize, debouncedSearchTerm, statusFilter, progressFilter, sortBy, sellers, buyers]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, searchTerm, statusFilter, progressFilter, sortBy]);

  const pendingTotal =
    sellers.filter((s) =>
      ["pending", "pending_validation", "manual_review_required", "under_compliance_review"].includes(
        s.onboardingStatus,
      ),
    ).length +
    buyers.filter((b) =>
      ["pending", "pending_validation", "manual_review_required", "under_compliance_review"].includes(
        b.onboardingStatus,
      ),
    ).length;
  const activeSellers = sellers.filter(
    (s) => s.onboardingStatus === "approved_for_procurement",
  ).length;
  const activeBuyers = buyers.filter(
    (b) => b.onboardingStatus === "approved_for_procurement",
  ).length;
  const totalNetwork = sellers.length + buyers.length;
  const rejectedTotal = [...sellers, ...buyers].filter(
    (item) => item.onboardingStatus === "rejected",
  ).length;
  const correctionTotal = [...sellers, ...buyers].filter(
    (item) => item.onboardingStatus === "resubmission_required",
  ).length;
  const averageProgress = totalNetwork
    ? Math.round(
      [...sellers, ...buyers].reduce(
        (sum, item) => sum + getProgress(item),
        0,
      ) / totalNetwork,
    )
    : 0;

  const toggleAdminSort = (key: string) => {
    if (key === "submitted") {
      setSortBy(sortBy === "oldest" ? "newest" : "oldest");
    } else if (key === "progress") {
      setSortBy(sortBy === "progress" ? "progress_asc" : "progress");
    } else if (key === "entity" || key === "name") {
      setSortBy(sortBy === "entity" ? "entity_desc" : "entity");
    } else if (key === "category") {
      setSortBy(sortBy === "category" ? "category_desc" : "category");
    } else if (key === "status") {
      setSortBy(sortBy === "status" ? "status_desc" : "status");
    }
  };

  const SortTableHead = ({
    label,
    sortKey,
    className = "",
  }: {
    label: string;
    sortKey: string;
    className?: string;
  }) => {
    let isActive = false;
    let isAsc = true;

    if (sortKey === "submitted") {
      isActive = sortBy === "oldest" || sortBy === "newest";
      isAsc = sortBy === "oldest";
    } else if (sortKey === "progress") {
      isActive = sortBy === "progress" || sortBy === "progress_asc";
      isAsc = sortBy === "progress_asc";
    } else if (sortKey === "entity" || sortKey === "name") {
      isActive = sortBy === "entity" || sortBy === "entity_desc";
      isAsc = sortBy === "entity";
    } else if (sortKey === "category") {
      isActive = sortBy === "category" || sortBy === "category_desc";
      isAsc = sortBy === "category";
    } else if (sortKey === "status") {
      isActive = sortBy === "status" || sortBy === "status_desc";
      isAsc = sortBy === "status";
    }

    return (
      <TableHead className={cn("px-6 py-4", className)}>
        <button
          type="button"
          onClick={() => toggleAdminSort(sortKey)}
          className={cn(
            "inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-[#12335f] transition-colors",
            isActive && "text-[#12335f]"
          )}
        >
          {label}
          {isActive ? (
            isAsc ? (
              <ArrowUp className="h-3 w-3 text-[#12335f]" />
            ) : (
              <ArrowDown className="h-3 w-3 text-[#12335f]" />
            )
          ) : (
            <ArrowUpDown className="h-3 w-3 opacity-40" />
          )}
        </button>
      </TableHead>
    );
  };

  const handleKpiClick = (target: string) => {
    if (target === "pending") {
      setStatusFilter("pending");
      setAdminView("scrutiny");
    } else if (target === "sellers") {
      setActiveTab("sellers");
      setStatusFilter("approved");
      setAdminView("applications");
    } else if (target === "buyers") {
      setActiveTab("buyers");
      setStatusFilter("approved");
      setAdminView("applications");
    } else {
      setStatusFilter("all");
      setProgressFilter("all");
      setAdminView("reports");
    }
  };

  const handleExportCsv = () => {
    const rows = currentData.map((item, index) => ({
      "Sr No": index + 1,
      "Stakeholder Type": item.role || activeTab.replace(/s$/, ""),
      "Applicant Name": item.name || "",
      "Entity Name": getEntityName(item),
      PAN: item.profile?.pan || "",
      GST: item.profile?.gst || "",
      State: item.profile?.state || "",
      Category: getPrimaryCategory(item),
      "Submitted Date": formatDateTime(item.createdAt),
      Status: item.onboardingStatus || "pending",
      "Verification Progress": `${getProgress(item)}%`,
    }));

    if (!rows.length) {
      toast.error("No records available for export");
      return;
    }

    const escapeCsv = (value: any) =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(","),
      ...rows.map((row) =>
        headers.map((header) => escapeCsv((row as any)[header])).join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `admin-onboarding-${activeTab}-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} onboarding records`);
  };

  return (
    <div className="relative min-h-[calc(100vh-100px)]">
      <div
        className={cn(
          "space-y-6 pb-20 transition-all duration-300",
          selectedItem && "blur-sm pointer-events-none",
        )}
      >
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-base font-extrabold tracking-tight text-indigo-950 uppercase">
              Registration Management
            </h1>
            <p className="text-slate-500 font-medium">
              Review, filter, export and approve stakeholder registrations.
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <Button
              variant="outline"
              onClick={handleExportCsv}
              disabled={currentData.length === 0}
              className="rounded-xl border-slate-200 text-slate-600 font-bold uppercase tracking-widest text-[10px]"
            >
              <Download className="mr-2 h-3.5 w-3.5" />
              Export CSV
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <div className="min-w-0 space-y-6">
            {/* Stats Section */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
              {[
                {
                  label: "Pending Approval",
                  value: pendingTotal,
                  sub: "Needs scrutiny action",
                  icon: Clock,
                  target: "pending",
                  tone: "amber",
                },
                {
                  label: "Active Sellers",
                  value: activeSellers,
                  sub: "Approved supplier base",
                  icon: ShoppingBag,
                  target: "sellers",
                  tone: "indigo",
                },
                {
                  label: "Active Buyers",
                  value: activeBuyers,
                  sub: "Approved procurement users",
                  icon: Building2,
                  target: "buyers",
                  tone: "blue",
                },
                {
                  label: "Total Network",
                  value: totalNetwork,
                  sub: `${averageProgress}% average verification`,
                  icon: Users,
                  target: "network",
                  tone: "slate",
                },
              ].map((stat) => (
                <button
                  key={stat.label}
                  type="button"
                  onClick={() => handleKpiClick(stat.target)}
                  className="text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#12335f] focus:ring-offset-2 rounded-2xl"
                  aria-label={`Filter by ${stat.label}`}
                >
                  <Card className="border border-slate-100 shadow-sm rounded-2xl overflow-hidden hover:shadow-lg hover:-translate-y-0.5 hover:border-[#12335f]/40 transition-all">
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                            {stat.label}
                          </p>
                          <p className={cn("text-2xl font-black tracking-tighter", isLoading ? "text-slate-300" : "text-slate-900")}>
                            {isLoading ? "0" : stat.value}
                          </p>
                          <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                            {stat.sub}
                          </p>
                        </div>
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-[#12335f]">
                          <stat.icon className="h-5 w-5" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </button>
              ))}
            </div>

            {adminView !== "applications" && (
              <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:grid-cols-3">
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">
                    Current Desk
                  </p>
                  <p className="mt-2 text-sm font-black text-[#12335f]">
                    {adminView === "scrutiny"
                      ? "Pending Scrutiny Queue"
                      : adminView === "reports"
                        ? "MIS Compliance Snapshot"
                        : "Correction & Rejection Flags"}
                  </p>
                  <p className="mt-1 text-xs font-medium text-slate-600">
                    {adminView === "scrutiny"
                      ? "Prioritise applications waiting for section-wise verification."
                      : adminView === "reports"
                        ? "Review the overall health of seller and buyer onboarding."
                        : "Track applications that need correction, resubmission, or closure."}
                  </p>
                </div>
                <MetricTile
                  label="Correction Required"
                  value={correctionTotal}
                />
                <MetricTile
                  label="Rejected Applications"
                  value={rejectedTotal}
                />
              </div>
            )}

            <Card className="border-none shadow-xl shadow-slate-200/50 rounded-2xl overflow-hidden">
              <CardHeader className="bg-white p-0 border-b border-slate-100">
                <Tabs
                  tabs={[
                    { id: "sellers", label: "Seller Onboarding" },
                    { id: "buyers", label: "Buyer Onboarding" },
                  ]}
                  activeTab={activeTab}
                  onChange={setActiveTab}
                  className="px-6 pt-4 space-x-8"
                />
              </CardHeader>
              <CardContent className="p-0">
                <div className="p-4 md:p-6 space-y-4 bg-slate-50/50">
                  <div className="flex items-center gap-2 text-[#12335f]">
                    <Filter className="h-4 w-4" />
                    <p className="text-[10px] font-black uppercase tracking-widest">
                      Procurement Verification Filters
                    </p>
                  </div>
                  <p className="text-xs font-medium text-slate-500">
                    Showing {currentData.length}{" "}
                    {activeTab === "sellers" ? "seller" : "buyer"} application
                    {currentData.length === 1 ? "" : "s"} for the selected
                    criteria.
                  </p>

                  {/* Toolbar — desktop: [search 80%] [status] [progress] [sort] [reset] [view-toggle].
                      Mobile: only [search] + [filters button]; tapping the button reveals a drawer
                      with every filter and a Reset Filters action. */}
                  <div className="space-y-3">
                    {/* Desktop layout: single row with search ~80% width */}
                    <div className="hidden md:grid items-stretch gap-2 md:grid-cols-[minmax(0,4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
                      <div className="relative min-w-0">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                          placeholder="Search by company, PAN, GST, state, or applicant name..."
                          className="w-full pl-10 pr-4 h-11 rounded-xl border border-slate-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          aria-label="Search applications"
                        />
                      </div>
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        aria-label="Status filter"
                        className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-wide text-slate-600 outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="all">All Status</option>
                        <option value="pending">Pending / Review</option>
                        <option value="approved">Approved</option>
                        <option value="resubmission">Correction Required</option>
                        <option value="rejected">Rejected</option>
                      </select>
                      <select
                        value={progressFilter}
                        onChange={(e) => setProgressFilter(e.target.value)}
                        aria-label="Progress filter"
                        className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-wide text-slate-600 outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="all">All Progress</option>
                        <option value="not_started">0% Verified</option>
                        <option value="in_progress">In Progress</option>
                        <option value="complete">100% Verified</option>
                      </select>
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        aria-label="Sort"
                        className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-wide text-slate-600 outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="newest">Newest First</option>
                        <option value="oldest">Oldest First</option>
                        <option value="progress">Progress High</option>
                        <option value="entity">Entity A-Z</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          setSearchTerm("");
                          setStatusFilter("all");
                          setProgressFilter("all");
                          setSortBy("newest");
                        }}
                        className="h-11 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-wide text-slate-600 hover:text-[#12335f] shrink-0"
                        title="Reset filters"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        <span className="hidden lg:inline">Reset</span>
                      </button>
                      {/* List / Grid view toggle sits to the RIGHT of Reset on desktop */}
                      <div className="inline-flex shrink-0">
                        <ViewModeToggle value={viewMode} onChange={setViewMode} />
                      </div>
                    </div>

                    {/* Mobile layout: search on top, single Filters button below */}
                    <div className="md:hidden space-y-2">
                      <div className="relative min-w-0">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                          placeholder="Search applications..."
                          className="w-full pl-10 pr-4 h-11 rounded-xl border border-slate-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          aria-label="Search applications"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowMobileFilters((v) => !v)}
                        aria-expanded={showMobileFilters}
                        aria-controls="admin-onboarding-mobile-filters"
                        className={cn(
                          "h-11 w-full inline-flex items-center justify-center gap-2 rounded-xl border bg-white px-3 text-[11px] font-black uppercase tracking-wide transition",
                          showMobileFilters
                            ? "border-[#12335f] text-[#12335f]"
                            : "border-slate-200 text-slate-600 hover:border-[#12335f]/40 hover:text-[#12335f]"
                        )}
                      >
                        <Filter className="h-3.5 w-3.5" />
                        Filters
                        {(statusFilter !== "all" || progressFilter !== "all" || sortBy !== "newest") && (
                          <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#12335f] px-1.5 text-[9px] font-black text-white">
                            {[statusFilter !== "all", progressFilter !== "all", sortBy !== "newest"].filter(Boolean).length}
                          </span>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Mobile filters drawer — only renders on mobile */}
                  {showMobileFilters && (
                    <div
                      id="admin-onboarding-mobile-filters"
                      className="md:hidden grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm animate-in fade-in slide-in-from-top-2 duration-200"
                    >
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        aria-label="Status filter"
                        className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-wide text-slate-600 outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="all">All Status</option>
                        <option value="pending">Pending / Review</option>
                        <option value="approved">Approved</option>
                        <option value="resubmission">Correction Required</option>
                        <option value="rejected">Rejected</option>
                      </select>
                      <select
                        value={progressFilter}
                        onChange={(e) => setProgressFilter(e.target.value)}
                        aria-label="Progress filter"
                        className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-wide text-slate-600 outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="all">All Progress</option>
                        <option value="not_started">0% Verified</option>
                        <option value="in_progress">In Progress</option>
                        <option value="complete">100% Verified</option>
                      </select>
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        aria-label="Sort"
                        className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-wide text-slate-600 outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="newest">Newest First</option>
                        <option value="oldest">Oldest First</option>
                        <option value="progress">Progress High</option>
                        <option value="entity">Entity A-Z</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          setSearchTerm("");
                          setStatusFilter("all");
                          setProgressFilter("all");
                          setSortBy("newest");
                          setShowMobileFilters(false);
                        }}
                        className="h-11 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-wide text-slate-600"
                      >
                        <RefreshCw className="h-3.5 w-3.5" /> Reset Filters
                      </button>
                    </div>
                  )}

                  {adminView !== "applications" && (
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-slate-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-[#12335f]">
                        View: {adminView.replace("_", " ")}
                      </span>
                    </div>
                  )}
                </div>

                {isLoading ? (
                  <div className="p-6 space-y-4">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="flex items-center justify-between py-4 border-b border-slate-50 animate-pulse">
                        <div className="h-4 w-8 bg-slate-100 rounded" />
                        <div className="h-4 w-1/4 bg-slate-100 rounded" />
                        <div className="h-4 w-1/4 bg-slate-100 rounded" />
                        <div className="h-4.5 w-20 bg-slate-100 rounded" />
                        <div className="h-4 w-16 bg-slate-100 rounded" />
                        <div className="h-4 w-12 bg-slate-100 rounded" />
                      </div>
                    ))}
                  </div>
                ) : currentData.length === 0 ? (
                  <div className="py-20 text-center text-slate-400 border-2 border-dashed border-slate-100 m-6 rounded-2xl">
                    No {activeTab} registrations in record.
                  </div>
                ) : (
                  <>
                    {/* Responsive Table for Desktop (List view) */}
                    <div className={cn(
                      "overflow-x-auto no-scrollbar",
                      viewMode === "list" ? "hidden md:block" : "hidden"
                    )}>
                      <Table>
                        <TableHeader className="bg-slate-50/80 border-y border-slate-100">
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-6 py-4">
                              Sr. No.
                            </TableHead>
                            <SortTableHead label="Full Name" sortKey="name" />
                            <SortTableHead label="Entity Name" sortKey="entity" />
                            <SortTableHead label="Budget / Category" sortKey="category" />
                            <SortTableHead label="Submitted At" sortKey="submitted" />
                            <SortTableHead label="Progress" sortKey="progress" />
                            <SortTableHead label="Status" sortKey="status" />
                            <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-6 py-4 text-right">
                              Action
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pagedCurrentData.map((item, index) => (
                            <TableRow
                              key={item._id}
                              onMouseEnter={() => prefetchDetail(item)}
                              className="group hover:bg-slate-50/50 transition-colors border-b border-slate-50"
                            >
                              <TableCell className="px-6 py-8">
                                <div className="font-mono text-xs font-black text-slate-400">
                                  {String((currentPage - 1) * pageSize + index + 1).padStart(2, "0")}
                                </div>
                              </TableCell>
                              <TableCell className="px-6 py-8">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void openItemForReview(item);
                                  }}
                                  className="block text-left group/name cursor-pointer"
                                  title="Click to view full personal details"
                                >
                                  <div className="font-bold text-slate-800 text-xs tracking-tight group-hover/name:text-[#12335f] group-hover/name:underline decoration-[#f9a825] underline-offset-2 transition-colors flex items-center gap-1.5">
                                    <span className="text-wrap-anywhere">{item.name}</span>
                                    <Eye className="h-3 w-3 opacity-0 group-hover/name:opacity-100 text-[#12335f] transition-opacity shrink-0" />
                                  </div>
                                  <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                    {item.role || activeTab.replace(/s$/, "")}
                                  </div>
                                </button>
                              </TableCell>
                              <TableCell className="px-6 py-8">
                                {getEntityName(item) ? (
                                  <div className="font-bold text-slate-600 text-xs underline decoration-indigo-200 underline-offset-4 break-words">
                                    {getEntityName(item)}
                                  </div>
                                ) : (
                                  <div className="text-xs font-semibold italic text-slate-400">
                                    Onboarding in progress
                                  </div>
                                )}
                                {getEntityLocation(item) && (
                                  <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                    {getEntityLocation(item)}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="px-6 py-8">
                                <div className="space-y-1">
                                  <div className="text-[10px] font-black text-indigo-600 uppercase">
                                    {item.role === "buyer"
                                      ? getDisplayText(item.profile?.annualBudget, "Budget pending")
                                      : getPrimaryCategory(item)}
                                  </div>
                                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
                                    {item.role === "buyer"
                                      ? getPrimaryCategory(item)
                                      : item.profile?.industry ||
                                      "Manufacturing"}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="px-6 py-8">
                                <div className="text-xs font-bold text-slate-500 font-mono">
                                  {formatDateTime(item.createdAt)}
                                </div>
                              </TableCell>
                              <TableCell className="px-6 py-8">
                                <div className="min-w-28 space-y-2">
                                  <div className="flex items-center justify-between text-[10px] font-black uppercase text-slate-500">
                                    <span>Verified</span>
                                    <span>{getProgress(item)}%</span>
                                  </div>
                                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                                    <div
                                      className="h-full rounded-full bg-[#12335f]"
                                      style={{ width: `${getProgress(item)}%` }}
                                    />
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="px-6 py-8">
                                <div className="space-y-2">
                                  {getStatusBadge(item.onboardingStatus)}
                                  <div className="flex space-x-0.5">
                                    {getSections(item).map((section) => (
                                      <div
                                        key={section}
                                        className={
                                          cn(
                                            "h-1.5 w-3 rounded-full",
                                            item.sectionStatus?.[section] ===
                                              "approved"
                                              ? "bg-green-500"
                                              : item.sectionStatus?.[
                                                section
                                              ] === "rejected"
                                                ? "bg-red-500"
                                                : "bg-slate-200",
                                          ) || ""
                                        }
                                        title={`${section}: ${item.sectionStatus?.[section] || "pending"}`}
                                      />
                                    ))}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="px-6 py-8 text-right">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void openItemForReview(item);
                                  }}
                                  className="text-[10px] font-black text-indigo-600 uppercase hover:underline hover:text-indigo-800 transition-all decoration-2 underline-offset-4"
                                >
                                  Review
                                </button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Desktop Grid view (alternative to table) */}
                    {viewMode === "grid" && (
                      <div className="hidden md:grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 p-4 md:p-6 bg-slate-50/50 rounded-b-2xl border-t border-slate-100">
                        {pagedCurrentData.map((item, index) => {
                          const getAvatarGradient = (status: string) => {
                            switch (status) {
                              case "approved_for_procurement":
                                return "bg-gradient-to-br from-emerald-600 to-green-500 shadow-emerald-500/10";
                              case "rejected":
                                return "bg-gradient-to-br from-red-600 to-rose-500 shadow-red-500/10";
                              case "resubmission_required":
                                return "bg-gradient-to-br from-amber-500 to-orange-400 shadow-amber-500/10";
                              default:
                                return "bg-gradient-to-br from-[#12335f] to-[#25528c] shadow-[#12335f]/10";
                            }
                          };

                          return (
                            <div
                              key={item._id}
                              onClick={() => void openItemForReview(item)}
                              onMouseEnter={() => prefetchDetail(item)}
                              className="group cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-[#12335f]/25 transition-all duration-300 flex flex-col justify-between min-w-0"
                            >
                              <div>
                                {/* Top Row - Meta & Badge */}
                                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 mb-3">
                                  <div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                    {item.role || activeTab.replace(/s$/, "")}
                                    {" · #"}
                                    {String((currentPage - 1) * pageSize + index + 1).padStart(2, "0")}
                                  </div>
                                  <div className="shrink-0">
                                    {getStatusBadge(item.onboardingStatus)}
                                  </div>
                                </div>

                                {/* Identity - Avatar & Names */}
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className={cn(
                                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-md text-sm font-extrabold text-white transition-all duration-300 group-hover:scale-105",
                                    getAvatarGradient(item.onboardingStatus)
                                  )}>
                                    {String(item.name || "?").charAt(0).toUpperCase()}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="font-bold text-slate-800 text-sm tracking-tight group-hover:text-[#12335f] transition-colors line-clamp-2">
                                      {item.name}
                                    </div>
                                    <div className="mt-0.5 text-xs font-semibold text-slate-500 line-clamp-2" title={getEntityName(item) || undefined}>
                                      {getEntityName(item) || (
                                        <span className="font-medium italic text-slate-400">Onboarding in progress</span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Metadata Grid */}
                                <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-100 pt-3">
                                  <div className="flex items-start gap-2 min-w-0">
                                    <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-slate-400 group-hover:text-[#12335f]/70 transition-colors" />
                                    <div className="min-w-0">
                                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Location</p>
                                      <p className="text-[11px] font-semibold text-slate-700 truncate" title={getEntityLocation(item) || undefined}>
                                        {getEntityLocation(item) || "—"}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex items-start gap-2 min-w-0">
                                    <Briefcase className="h-3.5 w-3.5 mt-0.5 shrink-0 text-slate-400 group-hover:text-[#12335f]/70 transition-colors" />
                                    <div className="min-w-0">
                                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Category</p>
                                      <p className="text-[11px] font-semibold text-slate-700 truncate" title={item.role === "buyer" ? getDisplayText(item.profile?.annualBudget, "Budget pending") : getPrimaryCategory(item)}>
                                        {item.role === "buyer"
                                          ? getDisplayText(item.profile?.annualBudget, "Budget pending")
                                          : getPrimaryCategory(item)}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex items-start gap-2 min-w-0">
                                    <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0 text-slate-400 group-hover:text-[#12335f]/70 transition-colors" />
                                    <div className="min-w-0">
                                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Submitted</p>
                                      <p className="text-[11px] font-semibold text-slate-700 font-mono">
                                        {formatDateTime(item.createdAt)}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex items-start gap-2 min-w-0">
                                    <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0 text-slate-400 group-hover:text-[#12335f]/70 transition-colors" />
                                    <div className="min-w-0">
                                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Verified</p>
                                      <p className="text-[11px] font-bold text-[#12335f]">
                                        {getProgress(item)}%
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Progress bar */}
                              <div className="mt-4">
                                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                                  <div
                                    className="h-full rounded-full bg-[#12335f] transition-all duration-500"
                                    style={{ width: `${getProgress(item)}%` }}
                                  />
                                </div>

                                {/* Footer - Section Dots & CTA */}
                                <div className="mt-3.5 flex items-center justify-between gap-2">
                                  <div className="flex space-x-1">
                                    {getSections(item).map((section) => {
                                      const sectionStatus = item.sectionStatus?.[section];
                                      const statusColors = {
                                        approved: "bg-emerald-500 shadow-sm shadow-emerald-500/20",
                                        rejected: "bg-red-500 shadow-sm shadow-red-500/20",
                                        pending: "bg-slate-200",
                                      };
                                      const colorClass = statusColors[sectionStatus as keyof typeof statusColors] || "bg-slate-200";
                                      return (
                                        <div
                                          key={section}
                                          className={cn("h-1.5 w-3 rounded-full transition-all duration-300", colorClass)}
                                          title={`${section}: ${sectionStatus || "pending"}`}
                                        />
                                      );
                                    })}
                                  </div>
                                  <div className="text-[10px] font-black text-indigo-600 group-hover:text-indigo-800 transition-colors flex items-center gap-1">
                                    <span>REVIEW</span>
                                    <span className="transform group-hover:translate-x-0.5 transition-transform duration-200">→</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Responsive Card Grid for Mobile */}
                    <div className="md:hidden grid grid-cols-1 gap-4 p-4">
                      {pagedCurrentData.map((item, index) => {
                        const getAvatarGradient = (status: string) => {
                          switch (status) {
                            case "approved_for_procurement":
                              return "bg-gradient-to-br from-emerald-600 to-green-500 shadow-emerald-500/10";
                            case "rejected":
                              return "bg-gradient-to-br from-red-600 to-rose-500 shadow-red-500/10";
                            case "resubmission_required":
                              return "bg-gradient-to-br from-amber-500 to-orange-400 shadow-amber-500/10";
                            default:
                              return "bg-gradient-to-br from-[#12335f] to-[#25528c] shadow-[#12335f]/10";
                          }
                        };

                        return (
                          <div
                            key={item._id}
                            onClick={() => void openItemForReview(item)}
                            className="group cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md active:bg-slate-50 transition-all flex flex-col justify-between min-w-0"
                          >
                            <div>
                              {/* Top Row - Meta & Badge */}
                              <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5 mb-2.5">
                                <div className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400">
                                  {item.role || activeTab.replace(/s$/, "")}
                                  {" · #"}
                                  {String((currentPage - 1) * pageSize + index + 1).padStart(2, "0")}
                                </div>
                                <div className="shrink-0 scale-90 origin-right">
                                  {getStatusBadge(item.onboardingStatus)}
                                </div>
                              </div>

                              {/* Identity - Avatar & Names */}
                              <div className="flex items-center gap-3 min-w-0">
                                <div className={cn(
                                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-md text-xs font-extrabold text-white",
                                  getAvatarGradient(item.onboardingStatus)
                                )}>
                                  {String(item.name || "?").charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="font-bold text-slate-800 text-xs tracking-tight line-clamp-2">
                                    {item.name}
                                  </div>
                                  <div className="mt-0.5 text-[11px] font-semibold text-slate-500 line-clamp-2">
                                    {getEntityName(item) || (
                                      <span className="font-medium italic text-slate-400">Onboarding in progress</span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Metadata Grid */}
                              <div className="mt-3.5 grid grid-cols-2 gap-x-2.5 gap-y-1.5 border-t border-slate-100 pt-3">
                                <div className="flex items-start gap-1.5 min-w-0">
                                  <MapPin className="h-3 w-3 mt-0.5 shrink-0 text-slate-400" />
                                  <div className="min-w-0">
                                    <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400">Location</p>
                                    <p className="text-[10px] font-semibold text-slate-700 truncate">
                                      {getEntityLocation(item) || "—"}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-start gap-1.5 min-w-0">
                                  <Briefcase className="h-3 w-3 mt-0.5 shrink-0 text-slate-400" />
                                  <div className="min-w-0">
                                    <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400">Category</p>
                                    <p className="text-[10px] font-semibold text-slate-700 truncate">
                                      {item.role === "buyer"
                                        ? getDisplayText(item.profile?.annualBudget, "Budget pending")
                                        : getPrimaryCategory(item)}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-start gap-1.5 min-w-0">
                                  <Clock className="h-3 w-3 mt-0.5 shrink-0 text-slate-400" />
                                  <div className="min-w-0">
                                    <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400">Submitted</p>
                                    <p className="text-[10px] font-semibold text-slate-700 font-mono">
                                      {formatDateTime(item.createdAt)}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-start gap-1.5 min-w-0">
                                  <ShieldCheck className="h-3 w-3 mt-0.5 shrink-0 text-slate-400" />
                                  <div className="min-w-0">
                                    <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400">Verified</p>
                                    <p className="text-[10px] font-bold text-[#12335f]">
                                      {getProgress(item)}%
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Progress bar */}
                            <div className="mt-3.5">
                              <div className="h-1 overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className="h-full rounded-full bg-[#12335f]"
                                  style={{ width: `${getProgress(item)}%` }}
                                />
                              </div>

                              {/* Footer - Section Dots & CTA */}
                              <div className="mt-3 flex items-center justify-between gap-2">
                                <div className="flex space-x-0.5">
                                  {getSections(item).map((section) => {
                                    const sectionStatus = item.sectionStatus?.[section];
                                    const statusColors = {
                                      approved: "bg-emerald-500",
                                      rejected: "bg-red-500",
                                      pending: "bg-slate-200",
                                    };
                                    const colorClass = statusColors[sectionStatus as keyof typeof statusColors] || "bg-slate-200";
                                    return (
                                      <div
                                        key={section}
                                        className={cn("h-1 w-2.5 rounded-full", colorClass)}
                                      />
                                    );
                                  })}
                                </div>
                                <div className="text-[9px] font-black text-indigo-600 uppercase">
                                  Review →
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <Pagination
                      page={currentPage}
                      pageSize={pageSize}
                      total={currentData.length}
                      onPageChange={setPage}
                      onPageSizeChange={setPageSize}
                      label="applications"
                    />
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* FULL SCREEN REVIEW OVERLAY */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b1f3a]/85 p-2 animate-in fade-in duration-300 md:p-4 backdrop-blur-sm">
          <div className="flex h-[95dvh] w-full max-w-[1300px] flex-col overflow-hidden rounded-lg border border-slate-300 bg-white shadow-2xl animate-in zoom-in-95 duration-300">
            {/* Government tricolor accent strip */}
            <div className="flex h-1 w-full">
              <div className="h-full flex-1 bg-[#ff9933]" aria-hidden />
              <div className="h-full flex-1 bg-white" aria-hidden />
              <div className="h-full flex-1 bg-[#138808]" aria-hidden />
            </div>

            {/* Header - government-portal styling: deep navy, gold accent, embossed feel */}
            <div className="relative border-b-2 border-[#f9a825] bg-gradient-to-r from-[#0b1f3a] via-[#12335f] to-[#0b1f3a] px-6 py-5 text-white md:px-8">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-[#f9a825]/40 bg-white/10 text-[#f9a825] shadow-inner">
                    <ShieldCheck className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#f9a825]">
                      Government of India · MSME Procurement Portal
                    </p>
                    <h2 className="text-lg font-extrabold uppercase leading-none tracking-tight md:text-xl">
                      Registration Scrutiny Desk
                    </h2>
                    <p className="text-[11px] font-medium text-slate-200">
                      Statutory verification and compliance decision module
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="hidden flex-col items-end gap-0.5 border-l border-white/20 pl-4 md:flex">
                    <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-300">Application ID</p>
                    <p className="font-mono text-xs font-extrabold text-white">
                      {selectedItem.registrationDetails?.userId || `MSME-${selectedItem._id?.toString().padStart(6, '0')}`}
                    </p>
                    <p className="text-[9px] font-bold text-slate-300">
                      Submitted {selectedItem.createdAt ? formatDateTime(selectedItem.createdAt) : '—'}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedItem(null);
                      setFeedback("");
                    }}
                    className="flex h-10 w-10 items-center justify-center rounded-md border border-white/20 bg-white/10 text-white transition-all hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-[#f9a825]"
                    aria-label="Close application review"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Content Area */}
            <div className="relative flex-1 space-y-8 overflow-y-auto bg-slate-50 p-4 md:p-6 lg:p-8">
              <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
                {/* Left Column: Identity Baseline */}
                <div className="space-y-5 lg:sticky lg:top-0 lg:col-span-4">
                  <div className="space-y-3">
                    <div className="flex flex-col gap-1">
                      <h3 className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#12335f]">
                        Identity Baseline
                      </h3>
                      <div className="h-0.5 w-20 rounded-full bg-[#f9a825]" />
                    </div>
                    <div className="relative space-y-6 overflow-hidden rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                      <div className="flex items-start gap-5">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-[#12335f] text-base font-extrabold text-white shadow-sm">
                          {selectedItem.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="space-y-1 min-w-0 pt-1">
                          <div className="truncate text-base font-extrabold leading-none tracking-tight text-slate-900">
                            {selectedItem.name}
                          </div>
                          <div className="truncate text-xs font-semibold lowercase text-slate-500">
                            {selectedItem.email}
                          </div>
                          <div className="mt-3 inline-flex rounded border border-slate-100 bg-slate-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-[#12335f]">
                            ID:{" "}
                            {selectedItem.registrationDetails?.userId ||
                              selectedItem.name
                                .toUpperCase()
                                .replace(/\s+/g, "-")}
                          </div>
                        </div>
                      </div>
                      <div className="flex pt-3 border-t border-slate-200/50">
                        {getStatusBadge(selectedItem.onboardingStatus || "pending")}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                        Verification Progress
                      </h3>
                      <span className="text-xs font-extrabold text-[#12335f]">
                        {getProgress(selectedItem)}%
                      </span>
                    </div>
                    <div className="mt-3 h-2 w-full overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                      <div
                        className="h-full rounded-full bg-[#12335f] transition-all duration-700"
                        style={{ width: `${getProgress(selectedItem)}%` }}
                      />
                    </div>
                  </div>

                  {selectedItem.organization && (
                    <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800">
                            Organization Status
                          </h3>
                          <p className="mt-1 text-sm font-bold text-slate-950">
                            {selectedItem.organization.organizationName || selectedItem.organization.name || "Linked organization"}
                          </p>
                        </div>
                        <Badge variant="success" className="text-[8px]">
                          {selectedItem.organization.verificationStatus || "VERIFIED"}
                        </Badge>
                      </div>
                      <div className="grid gap-2 text-xs font-semibold text-emerald-900">
                        <div className="flex items-center justify-between gap-3 rounded-md border border-emerald-200 bg-white/70 px-3 py-2">
                          <span>Organization ID</span>
                          <span>#{selectedItem.organization.id || selectedItem.organizationId}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded-md border border-emerald-200 bg-white/70 px-3 py-2">
                          <span>Onboarding</span>
                          <span>{selectedItem.organization.organizationOnboardingStatus || selectedItem.onboardingStatus}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-amber-800">
                        Compliance Flags
                      </h3>
                      <Badge variant={selectedItem.complianceViolations?.length ? "warning" : "success"} className="text-[8px]">
                        {selectedItem.complianceViolations?.length || 0} open
                      </Badge>
                    </div>
                    {selectedItem.complianceViolations?.length ? (
                      <div className="space-y-2">
                        {selectedItem.complianceViolations.map((flag: any) => (
                          <div key={flag.id} className="rounded-md border border-amber-200 bg-white p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-900">{flag.type?.replace(/_/g, " ")}</p>
                              <span className="rounded bg-amber-100 px-2 py-0.5 text-[9px] font-black uppercase text-amber-800">{flag.severity}</span>
                            </div>
                            <p className="mt-1 text-xs font-semibold text-slate-600">{flag.description}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs font-semibold text-amber-800">No open duplicate or fraud warnings.</p>
                    )}
                  </div>

                  {/* Quick Status Buttons */}
                  <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                    <Button
                      onClick={() =>
                        handleUpdateStatus(
                          selectedItem._id,
                          "approved_for_procurement",
                        )
                      }
                      disabled={
                        selectedItem.onboardingStatus === "approved_for_procurement"
                      }
                      className="h-12 w-full rounded-md bg-[#12335f] font-bold uppercase tracking-wide text-white hover:bg-[#0b2445]"
                    >
                      <CheckCircle className="h-5 w-5" />
                      <span>Approve Organization</span>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        handleUpdateStatus(
                          selectedItem._id,
                          "resubmission_required",
                        )
                      }
                      disabled={selectedItem.status === "resubmission_required"}
                      className="h-12 w-full rounded-md border-amber-300 bg-white font-bold uppercase tracking-wide text-amber-700 hover:bg-amber-50"
                    >
                      <AlertTriangle className="h-5 w-5" />
                      <span>Request Correction</span>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        handleUpdateStatus(selectedItem._id, "rejected")
                      }
                      disabled={selectedItem.onboardingStatus === "rejected"}
                      className="h-12 w-full rounded-md border-red-300 bg-white font-bold uppercase tracking-wide text-red-700 hover:bg-red-50"
                    >
                      <XCircle className="h-5 w-5" />
                      <span>Reject Application</span>
                    </Button>
                  </div>

                  {/* Admin Feedback Section */}
                  <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                    <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                      Admin Feedback / Query
                    </h3>
                    <div className="space-y-4">
                      <textarea
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        placeholder="Type feedback..."
                        className="h-24 w-full resize-none rounded-md border border-slate-300 bg-white p-3 text-xs font-medium transition-all focus:outline-none focus:ring-2 focus:ring-[#12335f]"
                      />
                      <Button
                        onClick={handleSendFeedback}
                        className="h-10 w-full rounded-md bg-[#12335f] text-[10px] font-bold uppercase tracking-wide text-white hover:bg-[#0b2445]"
                      >
                        Send Message
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Right Area: Structured Sections */}
                <div className="lg:col-span-8 space-y-6">
                  {selectedItem.role === "buyer" ? (
                    <>
                      {/* Buyer Section 1: Org */}
                      <div className="group rounded-lg border border-slate-200 bg-white p-5 shadow-sm animate-in slide-in-from-bottom-4 duration-300">
                        <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-100 relative">
                          <div className="flex items-center space-x-3">
                            <div className="w-9 h-9 rounded-md bg-slate-50 text-[#12335f] flex items-center justify-center shadow-sm">
                              <Building2 className="h-4 w-4" />
                            </div>
                            <h4 className="text-xs font-extrabold text-[#12335f] uppercase tracking-wide">
                              1. Organization Details
                            </h4>
                          </div>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() =>
                                handleUpdateSectionStatus(
                                  selectedItem._id,
                                  "org",
                                  "approved",
                                )
                              }
                              className={cn(
                                "w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all shadow-sm",
                                selectedItem.sectionStatus?.org === "approved"
                                  ? "bg-green-500 border-green-600 text-white"
                                  : "bg-white border-slate-200 text-slate-300 hover:bg-green-50 hover:text-green-600 hover:border-green-300",
                              )}
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => openRejectionModal("org")}
                              className={cn(
                                "w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all shadow-sm",
                                selectedItem.sectionStatus?.org === "rejected"
                                  ? "bg-red-500 border-red-600 text-white"
                                  : "bg-white border-slate-200 text-slate-300 hover:bg-red-50 hover:text-red-600 hover:border-red-300",
                              )}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        {(() => {
                          const gstDetails = selectedItem.profile?.gstVerificationDetails || {};
                          const gstin = selectedItem.profile?.gst || gstDetails.gstin || selectedItem.registrationDetails?.gstin;
                          return (
                            <div className="grid md:grid-cols-2 gap-8">
                              <InfoItem
                                label="Organization Name"
                                value={selectedItem.profile?.organizationName}
                                highlight
                              />
                              <InfoItem
                                label="Business Type"
                                value={selectedItem.profile?.businessType || selectedItem.registrationDetails?.businessType}
                              />
                              <InfoItem
                                label="Industry"
                                value={selectedItem.profile?.industry}
                              />
                              <InfoItem
                                label="PAN"
                                value={selectedItem.profile?.pan || selectedItem.registrationDetails?.pan}
                                mono
                                highlight
                              />
                              <InfoItem
                                label="CIN"
                                value={selectedItem.profile?.cin}
                              />
                              <InfoItem
                                label="GST"
                                value={gstin}
                              />
                              <InfoItem
                                label="GST Verification"
                                value={gstDetails.verified ? `Verified${gstDetails.source ? ` via ${gstDetails.source}` : ""}` : "Not Verified"}
                                highlight={Boolean(gstDetails.verified)}
                              />
                              {gstDetails.legalName && (
                                <InfoItem
                                  label="GST Legal Name"
                                  value={gstDetails.legalName}
                                />
                              )}
                              {gstDetails.status && (
                                <InfoItem
                                  label="GST Status"
                                  value={gstDetails.status}
                                />
                              )}
                              {gstDetails.address && (
                                <div className="md:col-span-2">
                                  <InfoItem
                                    label="GST Registered Address"
                                    value={[
                                      gstDetails.address,
                                      gstDetails.city,
                                      gstDetails.district,
                                      gstDetails.state,
                                      gstDetails.pincode,
                                    ].filter(Boolean).join(", ")}
                                  />
                                </div>
                              )}
                              <InfoItem
                                label="Website"
                                value={selectedItem.profile?.website}
                              />
                            </div>
                          );
                        })()}
                      </div>

                      {/* Buyer Section 2: Rep */}
                      <div className="group rounded-lg border border-slate-200 bg-white p-5 shadow-sm animate-in slide-in-from-bottom-4 duration-300 delay-75">
                        <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-100 relative">
                          <div className="flex items-center space-x-3">
                            <div className="w-9 h-9 rounded-md bg-slate-50 text-[#12335f] flex items-center justify-center shadow-sm">
                              <Users className="h-4 w-4" />
                            </div>
                            <h4 className="text-xs font-extrabold text-[#12335f] uppercase tracking-wide">
                              2. Authorized Representative
                            </h4>
                          </div>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() =>
                                handleUpdateSectionStatus(
                                  selectedItem._id,
                                  "rep",
                                  "approved",
                                )
                              }
                              className={cn(
                                "w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all shadow-sm",
                                selectedItem.sectionStatus?.rep === "approved"
                                  ? "bg-green-500 border-green-600 text-white"
                                  : "bg-white border-slate-200 text-slate-300 hover:bg-green-50 hover:text-green-600 hover:border-green-300",
                              )}
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => openRejectionModal("rep")}
                              className={cn(
                                "w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all shadow-sm",
                                selectedItem.sectionStatus?.rep === "rejected"
                                  ? "bg-red-500 border-red-600 text-white"
                                  : "bg-white border-slate-200 text-slate-300 hover:bg-red-50 hover:text-red-600 hover:border-red-300",
                              )}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <div className="grid md:grid-cols-2 gap-8">
                          <InfoItem
                            label="Representative Name"
                            value={selectedItem.profile?.representativeName || selectedItem.name}
                            highlight
                          />
                          <InfoItem
                            label="Designation"
                            value={selectedItem.profile?.designation}
                          />
                          <InfoItem
                            label="Department"
                            value={selectedItem.profile?.department}
                          />
                          <InfoItem
                            label="Official Email"
                            value={selectedItem.profile?.email || selectedItem.email}
                          />
                          <InfoItem
                            label="Mobile Number"
                            value={selectedItem.profile?.mobile || selectedItem.mobile}
                            highlight
                          />
                          <InfoItem
                            label="Alternate Mobile"
                            value={selectedItem.profile?.alternateMobile}
                          />
                        </div>
                      </div>

                      {/* Buyer Section 3: Address */}
                      <div className="group rounded-lg border border-slate-200 bg-white p-5 shadow-sm animate-in slide-in-from-bottom-4 duration-300">
                        <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-100 relative">
                          <div className="flex items-center space-x-3">
                            <div className="w-9 h-9 rounded-md bg-slate-50 text-[#12335f] flex items-center justify-center shadow-sm">
                              <MapPin className="h-4 w-4" />
                            </div>
                            <h4 className="text-xs font-extrabold text-[#12335f] uppercase tracking-wide">
                              3. Address Details
                            </h4>
                          </div>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() =>
                                handleUpdateSectionStatus(
                                  selectedItem._id,
                                  "address",
                                  "approved",
                                )
                              }
                              className={cn(
                                "w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all shadow-sm",
                                selectedItem.sectionStatus?.address ===
                                  "approved"
                                  ? "bg-green-500 border-green-600 text-white"
                                  : "bg-white border-slate-200 text-slate-300 hover:bg-green-50 hover:text-green-600 hover:border-green-300",
                              )}
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => openRejectionModal("address")}
                              className={cn(
                                "w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all shadow-sm",
                                selectedItem.sectionStatus?.address ===
                                  "rejected"
                                  ? "bg-red-500 border-red-600 text-white"
                                  : "bg-white border-slate-200 text-slate-300 hover:bg-red-50 hover:text-red-600 hover:border-red-300",
                              )}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <div className="grid md:grid-cols-2 gap-8">
                          <InfoItem
                            label="Country"
                            value={selectedItem.profile?.country}
                          />
                          <InfoItem
                            label="State"
                            value={selectedItem.profile?.state}
                          />
                          <InfoItem
                            label="City"
                            value={selectedItem.profile?.city}
                          />
                          <InfoItem
                            label="Pincode"
                            value={selectedItem.profile?.pincode}
                          />
                          <div className="md:col-span-2">
                            <InfoItem
                              label="Registered Address"
                              value={selectedItem.profile?.registeredAddress}
                            />
                          </div>
                          <div className="md:col-span-2">
                            <InfoItem
                              label="Corporate Address"
                              value={selectedItem.profile?.corporateAddress}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Buyer Section 4: Procurement */}
                      <div className="group rounded-lg border border-slate-200 bg-white p-5 shadow-sm animate-in slide-in-from-bottom-4 duration-300">
                        <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-100 relative">
                          <div className="flex items-center space-x-3">
                            <div className="w-9 h-9 rounded-md bg-slate-50 text-[#12335f] flex items-center justify-center shadow-sm">
                              <ShoppingBag className="h-4 w-4" />
                            </div>
                            <h4 className="text-xs font-extrabold text-[#12335f] uppercase tracking-wide">
                              4. Procurement Profile
                            </h4>
                          </div>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() =>
                                handleUpdateSectionStatus(
                                  selectedItem._id,
                                  "procurement",
                                  "approved",
                                )
                              }
                              className={cn(
                                "w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all shadow-sm",
                                selectedItem.sectionStatus?.procurement ===
                                  "approved"
                                  ? "bg-green-500 border-green-600 text-white"
                                  : "bg-white border-slate-200 text-slate-300 hover:bg-green-50 hover:text-green-600 hover:border-green-300",
                              )}
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => openRejectionModal("procurement")}
                              className={cn(
                                "w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all shadow-sm",
                                selectedItem.sectionStatus?.procurement ===
                                  "rejected"
                                  ? "bg-red-500 border-red-600 text-white"
                                  : "bg-white border-slate-200 text-slate-300 hover:bg-red-50 hover:text-red-600 hover:border-red-300",
                              )}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <div className="grid md:grid-cols-2 gap-8">
                          <InfoItem
                            label="Annual Budget"
                            value={selectedItem.profile?.annualBudget}
                            highlight
                          />
                          <div className="md:col-span-2">
                            <InfoItem
                              label="Procurement Categories"
                              value={[
                                selectedItem.profile?.procurementCategories?.join(", "),
                                selectedItem.profile?.otherCategoryDetails && `(Others: ${selectedItem.profile?.otherCategoryDetails})`
                              ].filter(Boolean).join(" ")}
                              highlight
                            />
                          </div>
                          <div className="md:col-span-2">
                            <InfoItem
                              label="Preferred Methods"
                              value={[
                                selectedItem.profile?.preferredMethods?.join(", "),
                                selectedItem.profile?.otherMethodDetails && `(Others: ${selectedItem.profile?.otherMethodDetails})`
                              ].filter(Boolean).join(" ")}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Buyer Section 5: Documents */}
                      <div className="group rounded-lg border border-slate-200 bg-white p-5 pb-6 shadow-sm animate-in slide-in-from-bottom-4 duration-300">
                        <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-100 relative">
                          <div className="flex items-center space-x-3">
                            <div className="w-9 h-9 rounded-md bg-slate-50 text-[#12335f] flex items-center justify-center shadow-sm">
                              <FileText className="h-4 w-4" />
                            </div>
                            <h4 className="text-xs font-extrabold text-[#12335f] uppercase tracking-wide">
                              5. Verification Documents
                            </h4>
                          </div>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() =>
                                handleUpdateSectionStatus(
                                  selectedItem._id,
                                  "docs",
                                  "approved",
                                )
                              }
                              className={cn(
                                "w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all shadow-sm",
                                selectedItem.sectionStatus?.docs === "approved"
                                  ? "bg-green-500 border-green-600 text-white"
                                  : "bg-white border-slate-200 text-slate-300 hover:bg-green-50 hover:text-green-600 hover:border-green-300",
                              )}
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => openRejectionModal("docs")}
                              className={cn(
                                "w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all shadow-sm",
                                selectedItem.sectionStatus?.docs === "rejected"
                                  ? "bg-red-500 border-red-600 text-white"
                                  : "bg-white border-slate-200 text-slate-300 hover:bg-red-50 hover:text-red-600 hover:border-red-300",
                              )}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        {(() => {
                          const buyerDocumentEntries = selectedItem.profile?.documents && typeof selectedItem.profile.documents === 'object'
                            ? Object.entries(selectedItem.profile.documents)
                              .map(([key, url]: [string, any]) => [key, getDocumentFiles(url).filter(getDocumentUrl)] as [string, any[]])
                              .filter(([, files]) => files.length > 0)
                            : [];

                          return (
                            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                              {buyerDocumentEntries.map(
                                ([key, documentFiles]: [string, any[]]) =>
                                  documentFiles.map((file: any, index: number) => {
                                    const label = getDocumentLabel(key);
                                    const fileName = getDocumentFileName(file, `${label} Document`);
                                    const uploadedAt = getDocumentUploadedAt(file);
                                    const cardKey = `${key}-${index}-${file?.fileId || file?.url || fileName}`;
                                    return (
                                      <div
                                        key={cardKey}
                                        className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-2 flex flex-col justify-between"
                                      >
                                        <div>
                                          <div className="flex items-center justify-between gap-3">
                                            <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                                              {label}
                                            </span>
                                            <Badge variant="default" className="bg-yellow-50 text-yellow-700 border-yellow-200 text-[9px] font-bold px-1.5 py-0.5">
                                              VERIFIED
                                            </Badge>
                                          </div>
                                          <p className="text-xs font-bold text-slate-700 mt-1 line-clamp-1" title={fileName}>
                                            {fileName}
                                          </p>
                                          {uploadedAt && (
                                            <p className="text-[9px] text-slate-400 mt-0.5">
                                              Uploaded: {formatDate(uploadedAt)}
                                            </p>
                                          )}
                                        </div>
                                        <div className="pt-2 border-t border-slate-100 mt-2">
                                          <button
                                            type="button"
                                            onClick={() => handleViewDocument({ fileId: file?.fileId, url: getDocumentUrl(file) }, label)}
                                            className="text-xs font-bold text-[#12335f] hover:underline inline-flex items-center gap-1"
                                          >
                                            <Eye className="h-3 w-3" /> View Document{documentFiles.length > 1 ? ` ${index + 1}` : ""}
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  }),
                              )}
                              {buyerDocumentEntries.length === 0 && (
                                <div className="col-span-full py-4 text-center text-xs text-slate-400 font-medium">
                                  No uploaded documents found for this buyer profile.
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Section 1: PAN */}
                      <div className="group rounded-lg border border-slate-200 bg-white p-5 shadow-sm animate-in slide-in-from-bottom-4 duration-300">
                        <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-100 relative">
                          <div className="flex items-center space-x-3">
                            <div className="w-9 h-9 rounded-md bg-slate-50 text-[#12335f] flex items-center justify-center shadow-sm">
                              <ShieldCheck className="h-4 w-4" />
                            </div>
                            <h4 className="text-xs font-extrabold text-[#12335f] uppercase tracking-wide">
                              1. Business PAN Validation
                            </h4>
                          </div>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() =>
                                handleUpdateSectionStatus(
                                  selectedItem._id,
                                  "pan",
                                  "approved",
                                )
                              }
                              className={cn(
                                "w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all shadow-sm",
                                selectedItem.sectionStatus?.pan === "approved"
                                  ? "bg-green-500 border-green-600 text-white"
                                  : "bg-white border-slate-200 text-slate-300 hover:bg-green-50 hover:text-green-600 hover:border-green-300",
                              )}
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => openRejectionModal("pan")}
                              className={cn(
                                "w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all shadow-sm",
                                selectedItem.sectionStatus?.pan === "rejected"
                                  ? "bg-red-500 border-red-600 text-white"
                                  : "bg-white border-slate-200 text-slate-300 hover:bg-red-50 hover:text-red-600 hover:border-red-300",
                              )}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <div className="grid md:grid-cols-2 gap-8">
                          <InfoItem
                            label="Organisation Type"
                            value={selectedItem.profile?.organizationType || "N/A"}
                            highlight
                          />
                          <InfoItem
                            label="PAN Number"
                            value={selectedItem.profile?.pan}
                            mono
                            highlight
                          />
                          <InfoItem
                            label="Name in PAN"
                            value={selectedItem.profile?.nameAsInPan}
                          />
                          <InfoItem
                            label="Date in PAN"
                            value={
                              selectedItem.profile?.dateAsInPan
                                ? new Date(
                                  selectedItem.profile.dateAsInPan,
                                ).toLocaleDateString()
                                : "N/A"
                            }
                          />
                          <InfoItem
                            label="Verification Status"
                            value={
                              selectedItem.profile?.panVerified
                                ? "VERIFIED"
                                : "PENDING"
                            }
                            highlight
                          />
                          {/* <InfoItem
                            label="Verification Method"
                            value={selectedItem.registrationDetails?.verificationMethod?.toUpperCase() || "N/A"}
                          /> */}
                          {/* <InfoItem
                            label="Aadhaar Number (Masked)"
                            value={selectedItem.registrationDetails?.aadhaarNumber ? selectedItem.registrationDetails.aadhaarNumber.replace(/.(?=.{4})/g, 'X') : "N/A"}
                          />
                          <InfoItem
                            label="Aadhaar Verification"
                            value={selectedItem.registrationDetails?.isAadhaarVerified ? "VERIFIED" : "PENDING"}
                          /> */}
                        </div>
                      </div>

                      {/* Section 2: Details */}
                      <div className="group rounded-lg border border-slate-200 bg-white p-5 shadow-sm animate-in slide-in-from-bottom-4 duration-300 delay-75">
                        <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-100 relative">
                          <div className="flex items-center space-x-3">
                            <div className="w-9 h-9 rounded-md bg-slate-50 text-[#12335f] flex items-center justify-center shadow-sm">
                              <Building2 className="h-4 w-4" />
                            </div>
                            <h4 className="text-xs font-extrabold text-[#12335f] uppercase tracking-wide">
                              2. Business Details
                            </h4>
                          </div>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() =>
                                handleUpdateSectionStatus(
                                  selectedItem._id,
                                  "details",
                                  "approved",
                                )
                              }
                              className={cn(
                                "w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all shadow-sm",
                                selectedItem.sectionStatus?.details ===
                                  "approved"
                                  ? "bg-green-500 border-green-600 text-white"
                                  : "bg-white border-slate-200 text-slate-300 hover:bg-green-50 hover:text-green-600 hover:border-green-300",
                              )}
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => openRejectionModal("details")}
                              className={cn(
                                "w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all shadow-sm",
                                selectedItem.sectionStatus?.details ===
                                  "rejected"
                                  ? "bg-red-500 border-red-600 text-white"
                                  : "bg-white border-slate-200 text-slate-300 hover:bg-red-50 hover:text-red-600 hover:border-red-300",
                              )}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <div className="grid md:grid-cols-2 gap-8">
                          <InfoItem
                            label="Organization Name"
                            value={selectedItem.profile?.businessName}
                            highlight
                          />
                          <InfoItem
                            label="Date of Incorporation"
                            value={
                              selectedItem.profile?.dateOfIncorporation
                                ? new Date(
                                  selectedItem.profile.dateOfIncorporation,
                                ).toLocaleDateString()
                                : "N/A"
                            }
                          />
                          <InfoItem
                            label="Role In Organization"
                            value={selectedItem.profile?.roleInOrg || selectedItem.registrationDetails?.roleInOrg || "N/A"}
                          />
                          <InfoItem
                            label="Registered Mobile"
                            value={selectedItem.profile?.mobile || selectedItem.mobile || selectedItem.profile?.offices?.[0]?.contactNumber || "N/A"}
                          />
                          {/* <InfoItem
                            label="Date of Birth"
                            value={
                              selectedItem.profile?.dob
                                ? new Date(selectedItem.profile.dob).toLocaleDateString()
                                : (selectedItem.dob ? new Date(selectedItem.dob).toLocaleDateString() : "N/A")
                            }
                          /> */}
                        </div>
                      </div>

                      {/* Section 3: Additional */}
                      <div className="group rounded-lg border border-slate-200 bg-white p-5 shadow-sm animate-in slide-in-from-bottom-4 duration-300">
                        <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-100 relative">
                          <div className="flex items-center space-x-3">
                            <div className="w-9 h-9 rounded-md bg-slate-50 text-[#12335f] flex items-center justify-center shadow-sm">
                              <Briefcase className="h-4 w-4" />
                            </div>
                            <h4 className="text-xs font-extrabold text-[#12335f] uppercase tracking-wide">
                              3. Additional Details
                            </h4>
                          </div>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() =>
                                handleUpdateSectionStatus(
                                  selectedItem._id,
                                  "additional",
                                  "approved",
                                )
                              }
                              className={cn(
                                "w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all shadow-sm",
                                selectedItem.sectionStatus?.additional ===
                                  "approved"
                                  ? "bg-green-500 border-green-600 text-white"
                                  : "bg-white border-slate-200 text-slate-300 hover:bg-green-50 hover:text-green-600 hover:border-green-300",
                              )}
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => openRejectionModal("additional")}
                              className={cn(
                                "w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all shadow-sm",
                                selectedItem.sectionStatus?.additional ===
                                  "rejected"
                                  ? "bg-red-500 border-red-600 text-white"
                                  : "bg-white border-slate-200 text-slate-300 hover:bg-red-50 hover:text-red-600 hover:border-red-300",
                              )}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <div className="grid md:grid-cols-2 gap-8">
                          <InfoItem
                            label="Startup Status"
                            value={
                              selectedItem.profile?.isStartup ? "YES" : "NO"
                            }
                          />
                          <InfoItem
                            label="Udyam Certified"
                            value={
                              selectedItem.profile?.isUdyamCertified
                                ? "YES"
                                : "NO"
                            }
                          />
                          <InfoItem
                            label="Bid Participation"
                            value={
                              selectedItem.profile?.participateInBid
                                ? "YES"
                                : "NO"
                            }
                          />
                          <InfoItem
                            label="MSME Type"
                            value={
                              selectedItem.profile?.msmeType
                                ? (MSME_TYPE_LABELS[selectedItem.profile.msmeType] || selectedItem.profile.msmeType)
                                : "N/A"
                            }
                          />
                          <InfoItem
                            label="Vendor Type"
                            value={
                              selectedItem.profile?.vendorType
                                ? (VENDOR_TYPE_LABELS[selectedItem.profile.vendorType] || selectedItem.profile.vendorType)
                                : "N/A"
                            }
                          />
                          <div className="md:col-span-2">
                            <InfoItem
                              label="Registration Types / Certifications"
                              value={
                                Array.isArray(selectedItem.profile?.registrationTypes) && selectedItem.profile.registrationTypes.length > 0
                                  ? selectedItem.profile.registrationTypes
                                    .map((type: string) => REGISTRATION_TYPE_LABELS[type] || type)
                                    .join(", ")
                                  : "N/A"
                              }
                            />
                          </div>
                        </div>
                      </div>

                      {/* Section 4: Offices */}
                      <div className="group rounded-lg border border-slate-200 bg-white p-5 shadow-sm animate-in slide-in-from-bottom-4 duration-300">
                        <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-100 relative">
                          <div className="flex items-center space-x-3">
                            <div className="w-9 h-9 rounded-md bg-slate-50 text-[#12335f] flex items-center justify-center shadow-sm">
                              <MapPin className="h-4 w-4" />
                            </div>
                            <h4 className="text-xs font-extrabold text-[#12335f] uppercase tracking-wide">
                              4. Office Locations
                            </h4>
                          </div>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() =>
                                handleUpdateSectionStatus(
                                  selectedItem._id,
                                  "offices",
                                  "approved",
                                )
                              }
                              className={cn(
                                "w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all shadow-sm",
                                selectedItem.sectionStatus?.offices ===
                                  "approved"
                                  ? "bg-green-500 border-green-600 text-white"
                                  : "bg-white border-slate-200 text-slate-300 hover:bg-green-50 hover:text-green-600 hover:border-green-300",
                              )}
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => openRejectionModal("offices")}
                              className={cn(
                                "w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all shadow-sm",
                                selectedItem.sectionStatus?.offices ===
                                  "rejected"
                                  ? "bg-red-500 border-red-600 text-white"
                                  : "bg-white border-slate-200 text-slate-300 hover:bg-red-50 hover:text-red-600 hover:border-red-300",
                              )}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <div className="space-y-4">
                          {selectedItem.profile?.offices?.map((office: any) => (
                            <div
                              key={office.id}
                              className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-start"
                            >
                              <div className="space-y-1">
                                <div className="flex items-center flex-wrap gap-2">
                                  <p className="text-xs font-extrabold text-slate-900 uppercase">
                                    {office.name}
                                  </p>
                                  <span className="text-[10px] font-bold text-[#12335f] bg-slate-100 px-2 py-0.5 rounded-full">
                                    {office.type}
                                  </span>
                                  {office.gstRegistered && (
                                    <Badge variant="success" className="text-[8px]">
                                      GST REG: {office.gstNumber || office.gstMasked || "Registered"}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-[11px] font-medium text-slate-600 uppercase">
                                  {office.address}
                                </p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                  {office.city}, {office.state} - {office.pincode}
                                </p>
                                {office.contactNumber && (
                                  <p className="text-[10px] font-bold text-slate-500 uppercase">
                                    Contact: <span className="text-slate-700 font-semibold">{office.contactNumber}</span>
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                          {(!selectedItem.profile?.offices ||
                            selectedItem.profile.offices.length === 0) && (
                              <p className="text-[10px] font-bold text-slate-400">
                                No offices registered.
                              </p>
                            )}
                        </div>
                      </div>

                      {/* Section 5: Bank */}
                      <div className="group rounded-lg border border-slate-200 bg-white p-5 shadow-sm animate-in slide-in-from-bottom-4 duration-300">
                        <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-100 relative">
                          <div className="flex items-center space-x-3">
                            <div className="w-9 h-9 rounded-md bg-slate-50 text-[#12335f] flex items-center justify-center shadow-sm">
                              <Building2 className="h-4 w-4" />
                            </div>
                            <h4 className="text-xs font-extrabold text-[#12335f] uppercase tracking-wide">
                              5. Bank Accounts
                            </h4>
                          </div>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() =>
                                handleUpdateSectionStatus(
                                  selectedItem._id,
                                  "bank",
                                  "approved",
                                )
                              }
                              className={cn(
                                "w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all shadow-sm",
                                selectedItem.sectionStatus?.bank === "approved"
                                  ? "bg-green-500 border-green-600 text-white"
                                  : "bg-white border-slate-200 text-slate-300 hover:bg-green-50 hover:text-green-600 hover:border-green-300",
                              )}
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => openRejectionModal("bank")}
                              className={cn(
                                "w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all shadow-sm",
                                selectedItem.sectionStatus?.bank === "rejected"
                                  ? "bg-red-500 border-red-600 text-white"
                                  : "bg-white border-slate-200 text-slate-300 hover:bg-red-50 hover:text-red-600 hover:border-red-300",
                              )}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <div className="space-y-4">
                          {selectedItem.profile?.bankAccounts?.map(
                            (bank: any) => (
                              <div
                                key={bank.id}
                                className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-start"
                              >
                                <div className="space-y-1">
                                  <p className="text-xs font-extrabold text-slate-900 uppercase">
                                    {bank.bankName}{" "}
                                    {bank.isPrimary && (
                                      <span className="text-[10px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full ml-2">
                                        PRIMARY
                                      </span>
                                    )}
                                  </p>
                                  <p className="text-[11px] font-bold text-slate-700 uppercase">
                                    A/C:{" "}
                                    <span className="text-slate-900">
                                      {bank.accountNumber}
                                    </span>{" "}
                                    | IFSC:{" "}
                                    <span className="text-slate-900">
                                      {bank.ifsc}
                                    </span>
                                  </p>
                                  <p className="text-[10px] font-medium text-slate-500 uppercase">
                                    Holder: {bank.holderName}
                                  </p>
                                  <p className="text-[10px] font-medium text-slate-400 uppercase">
                                    {bank.bankAddress}
                                  </p>
                                </div>
                                {bank.isVerified && (
                                  <Badge
                                    variant="success"
                                    className="text-[8px] h-5"
                                  >
                                    VERIFIED
                                  </Badge>
                                )}
                              </div>
                            ),
                          )}
                        </div>
                      </div>

                      {/* Section 6: e-Invoicing */}
                      {/* Section 6: Ownership */}
                      <div className="group rounded-lg border border-slate-200 bg-white p-5 pb-6 shadow-sm animate-in slide-in-from-bottom-4 duration-300">
                        <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-100 relative">
                          <div className="flex items-center space-x-3">
                            <div className="w-9 h-9 rounded-md bg-slate-50 text-[#12335f] flex items-center justify-center shadow-sm">
                              <ShieldCheck className="h-4 w-4" />
                            </div>
                            <h4 className="text-xs font-extrabold text-[#12335f] uppercase tracking-wide">
                              6. Beneficial Ownership
                            </h4>
                          </div>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() =>
                                handleUpdateSectionStatus(
                                  selectedItem._id,
                                  "ownership",
                                  "approved",
                                )
                              }
                              className={cn(
                                "w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all shadow-sm",
                                selectedItem.sectionStatus?.ownership ===
                                  "approved"
                                  ? "bg-green-500 border-green-600 text-white"
                                  : "bg-white border-slate-200 text-slate-300 hover:bg-green-50 hover:text-green-600 hover:border-green-300",
                              )}
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => openRejectionModal("ownership")}
                              className={cn(
                                "w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all shadow-sm",
                                selectedItem.sectionStatus?.ownership ===
                                  "rejected"
                                  ? "bg-red-500 border-red-600 text-white"
                                  : "bg-white border-slate-200 text-slate-300 hover:bg-red-50 hover:text-red-600 hover:border-red-300",
                              )}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <div className="grid md:grid-cols-2 gap-8">
                          <InfoItem
                            label="Declaration Accepted"
                            value={
                              selectedItem.profile?.ownershipDeclarationAccepted
                                ? "YES"
                                : "NO"
                            }
                            highlight
                          />
                          <InfoItem
                            label="Verification Status"
                            value={
                              selectedItem.profile?.ownershipVerified
                                ? "VERIFIED"
                                : "PENDING"
                            }
                          />
                        </div>
                      </div>

                      {/* Section 7: Submitted Verification Documents */}
                      <div className="group rounded-lg border border-slate-200 bg-white p-5 pb-6 shadow-sm animate-in slide-in-from-bottom-4 duration-300">
                        <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-100 relative">
                          <div className="flex items-center space-x-3">
                            <div className="w-9 h-9 rounded-md bg-slate-50 text-[#12335f] flex items-center justify-center shadow-sm">
                              <FileText className="h-4 w-4" />
                            </div>
                            <h4 className="text-xs font-extrabold text-[#12335f] uppercase tracking-wide">
                              7. Submitted Verification Documents
                            </h4>
                          </div>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() =>
                                handleUpdateSectionStatus(
                                  selectedItem._id,
                                  "documents",
                                  "approved",
                                )
                              }
                              className={cn(
                                "w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all shadow-sm",
                                selectedItem.sectionStatus?.documents ===
                                  "approved"
                                  ? "bg-green-500 border-green-600 text-white"
                                  : "bg-white border-slate-200 text-slate-300 hover:bg-green-50 hover:text-green-600 hover:border-green-300",
                              )}
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => openRejectionModal("documents")}
                              className={cn(
                                "w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all shadow-sm",
                                selectedItem.sectionStatus?.documents ===
                                  "rejected"
                                  ? "bg-red-500 border-red-600 text-white"
                                  : "bg-white border-slate-200 text-slate-300 hover:bg-red-50 hover:text-red-600 hover:border-red-300",
                              )}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        {(() => {
                          const { sellerDocuments, legacyDocuments } = getSellerOnboardingDocuments(selectedItem.profile);
                          return (
                            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                              {/* Render sellerDocuments (relational) */}
                              {sellerDocuments.length > 0 ? (
                                sellerDocuments.map((doc: any) => {
                                  const file = doc.fileAsset;
                                  if (!file) return null;
                                  return (
                                    <div key={doc.id} className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-2 flex flex-col justify-between">
                                      <div>
                                        <div className="flex items-center justify-between">
                                          <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                                            {doc.documentType}
                                          </span>
                                          <Badge variant="default" className={cn(
                                            "text-[9px] font-bold px-1.5 py-0.5",
                                            doc.verificationStatus === 'APPROVED' ? "bg-green-50 text-green-700 border-green-200" :
                                              doc.verificationStatus === 'REJECTED' ? "bg-red-50 text-red-700 border-red-200" :
                                                "bg-yellow-50 text-yellow-700 border-yellow-200"
                                          )}>
                                            {doc.verificationStatus}
                                          </Badge>
                                        </div>
                                        <p className="text-xs font-bold text-slate-700 mt-1 line-clamp-1" title={file.originalName}>
                                          {file.originalName}
                                        </p>
                                        {doc.uploadedAt && (
                                          <p className="text-[9px] text-slate-400 mt-0.5">
                                            Uploaded: {formatDate(doc.uploadedAt)}
                                          </p>
                                        )}
                                        {doc.remarks && (
                                          <p className="text-[10px] text-slate-500 mt-1 italic">
                                            Note: {doc.remarks}
                                          </p>
                                        )}
                                      </div>
                                      <div className="pt-2 border-t border-slate-100 mt-2">
                                        <button
                                          type="button"
                                          onClick={() => handleViewDocument(file, doc.documentType)}
                                          className="text-xs font-bold text-[#12335f] hover:underline inline-flex items-center gap-1"
                                        >
                                          <Eye className="h-3 w-3" /> View Document
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })
                              ) : null}

                              {/* Render documents JSON if any */}
                              {legacyDocuments.length > 0 &&
                                legacyDocuments.map(
                                  ([key, url]: [string, any]) => {
                                    const documentFiles = getDocumentFiles(url).filter(getDocumentUrl);
                                    if (documentFiles.length === 0) return null;
                                    return (
                                      <div key={key} className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-2 flex flex-col justify-between">
                                        <div>
                                          <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                                            {key}
                                          </span>
                                          <p className="text-xs font-bold text-slate-700 mt-1">
                                            Legacy Link Document
                                          </p>
                                        </div>
                                        <div className="pt-2 border-t border-slate-100 mt-2">
                                          {documentFiles.map((file: any, index: number) => (
                                            <button
                                              key={`${key}-${index}-${file?.fileId || file?.url || ''}`}
                                              type="button"
                                              onClick={() => handleViewDocument({ fileId: file?.fileId, url: getDocumentUrl(file) }, key)}
                                              className="text-xs font-bold text-[#12335f] hover:underline inline-flex items-center gap-1"
                                            >
                                              <Eye className="h-3 w-3" /> View Document{documentFiles.length > 1 ? ` ${index + 1}` : ""}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  }
                                )}

                              {sellerDocuments.length === 0 && legacyDocuments.length === 0 && (
                                <div className="col-span-full py-4 text-center text-xs text-slate-400 font-medium">
                                  No uploaded documents found for this seller profile.
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-center border-t border-slate-200 bg-white px-8 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                End of application record for verification
              </p>
            </div>
          </div>
        </div>
      )}
      {/* REJECTION REASON MODAL */}
      {isRejectModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300"
            onClick={() => {
              setIsRejectModalOpen(false);
              setRejectionReason("");
            }}
          />
          <div className="relative w-full max-w-md overflow-hidden rounded-lg border border-slate-300 bg-white shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between border-b border-slate-200 bg-[#12335f] px-6 py-4 text-white">
              <div className="space-y-1">
                <h3 className="text-base font-extrabold uppercase tracking-tight">
                  Provide Rejection Reason
                </h3>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-100">
                  Section: {activeSectionForRejection}
                </p>
              </div>
              <button
                onClick={() => {
                  setIsRejectModalOpen(false);
                  setRejectionReason("");
                }}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-white/20 bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-[#f9a825]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 p-6">
              <div className="space-y-3">
                <p className="text-xs font-medium leading-relaxed text-slate-600">
                  Please specify why this section is being rejected. This
                  feedback will be visible to the {selectedItem?.role}.
                </p>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="e.g., Uploaded documents are incorrect or unreadable..."
                  className="h-32 w-full resize-none rounded-md border border-slate-300 bg-white p-3 text-xs font-medium transition-all focus:outline-none focus:ring-2 focus:ring-red-600"
                  autoFocus
                />
              </div>

              <div className="flex flex-col space-y-3">
                <Button
                  onClick={handleConfirmRejection}
                  disabled={!rejectionReason.trim()}
                  className="h-11 w-full rounded-md bg-red-700 font-bold uppercase tracking-wide text-white hover:bg-red-800"
                >
                  Confirm Rejection
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsRejectModalOpen(false);
                    setRejectionReason("");
                  }}
                  className="h-11 w-full rounded-md border-slate-300 font-bold uppercase tracking-wide text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* COMPLIANCE OVERRIDE MODAL */}
      {isOverrideModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300"
            onClick={() => {
              setIsOverrideModalOpen(false);
              setOverrideReason("");
            }}
          />
          <div className="relative w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-300">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-[#12335f] px-6 py-4 text-white">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-300 animate-pulse" />
                <div className="space-y-0.5">
                  <h3 className="text-base font-extrabold uppercase tracking-tight">
                    Compliance Override Required
                  </h3>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-100">
                    Admin Approval Authorization
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsOverrideModalOpen(false);
                  setOverrideReason("");
                }}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-white/20 bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-[#f9a825]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content */}
            <div className="space-y-5 p-6 max-h-[75vh] overflow-y-auto">
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-700" />
                  <p className="text-xs font-bold text-amber-900">
                    Open Compliance Warnings Detected
                  </p>
                </div>
                <p className="text-xs font-medium leading-relaxed text-slate-600">
                  This profile has active compliance violations. Approving this organization requires providing a justification to log the override.
                </p>

                {/* List of violations */}
                {selectedItem?.complianceViolations && selectedItem.complianceViolations.length > 0 && (
                  <div className="mt-2 space-y-2 max-h-40 overflow-y-auto pr-1">
                    {selectedItem.complianceViolations.map((flag: any) => (
                      <div key={flag.id || flag._id} className="rounded-md border border-amber-200 bg-white p-2.5 shadow-sm">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[9px] font-black uppercase tracking-widest text-[#12335f]">
                            {flag.type?.replace(/_/g, " ")}
                          </p>
                          <span className={cn(
                            "rounded px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider",
                            flag.severity === "critical" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                          )}>
                            {flag.severity}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] font-semibold text-slate-600">
                          {flag.description}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  Admin Override Reason
                </label>
                <textarea
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Explain why this profile is being approved despite compliance flags (e.g., Verified physical documents, verified alternate business representation...)"
                  className="h-28 w-full resize-none rounded-lg border border-slate-300 bg-white p-3 text-xs font-medium transition-all focus:border-[#12335f] focus:outline-none focus:ring-2 focus:ring-[#12335f]/20"
                  autoFocus
                />
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col space-y-3 pt-2">
                <Button
                  onClick={() => handleUpdateStatus(selectedItem._id, "approved_for_procurement", overrideReason)}
                  disabled={!overrideReason.trim()}
                  className="h-11 w-full rounded-md bg-[#12335f] font-bold uppercase tracking-wide text-white hover:bg-[#0b2445] transition-all"
                >
                  Confirm Override Approval
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsOverrideModalOpen(false);
                    setOverrideReason("");
                  }}
                  className="h-11 w-full rounded-md border-slate-300 font-bold uppercase tracking-wide text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      <DocumentPreviewModal previewDocument={previewDocument} onClose={() => setPreviewDocument(null)} />
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-black text-slate-900">{value}</p>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
        Live onboarding record
      </p>
    </div>
  );
}

function InfoItem({
  label,
  value,
  mono = false,
  highlight = false,
}: {
  label: string;
  value?: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-1 rounded-md border border-slate-100 bg-slate-50/70 px-3 py-2">
      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p
        className={cn(
          "break-words text-xs font-semibold tracking-tight transition-all",
          highlight ? "text-[#12335f]" : "text-slate-800",
          mono && "font-mono",
        )}
      >
        {value || "Not Provided"}
      </p>
    </div>
  );
}
