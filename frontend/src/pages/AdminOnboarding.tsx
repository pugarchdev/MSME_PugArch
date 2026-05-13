import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { Button } from "../components/ui/button";
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
} from "lucide-react";
import { cn } from "../lib/utils";

export default function AdminOnboarding() {
  const authOptions = {
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
  };
  const cachedData = api.peek("/api/admin/onboarding", authOptions);
  const [sellers, setSellers] = useState<any[]>(cachedData?.sellers || []);
  const [buyers, setBuyers] = useState<any[]>(cachedData?.buyers || []);
  const [activeTab, setActiveTab] = useState("sellers");
  const [isLoading, setIsLoading] = useState(!cachedData);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [progressFilter, setProgressFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [adminView, setAdminView] = useState("applications");
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [feedback, setFeedback] = useState("");

  // Rejection Modal State
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [activeSectionForRejection, setActiveSectionForRejection] =
    useState("");
  const [rejectionReason, setRejectionReason] = useState("");

  const fetchData = async () => {
    if (!cachedData) setIsLoading(true);
    try {
      const res = await api.fetch("/api/admin/onboarding", authOptions);
      const data = await res.json();
      setSellers(data.sellers || []);
      setBuyers(data.buyers || []);
    } catch (err) {
      toast.error("Failed to load registrations");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleUpdateStatus = async (userId: string, status: string) => {
    try {
      const res = await api.post(
        "/api/admin/status",
        { userId, status },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        },
      );
      if (res.ok) {
        toast.success(`Complete application ${status}`);
        if (selectedItem && selectedItem._id === userId) {
          const sectionStatus =
            status === "approved"
              ? {
                  pan: "approved",
                  details: "approved",
                  additional: "approved",
                  offices: "approved",
                  bank: "approved",
                  einvoicing: "approved",
                  ownership: "approved",
                }
              : status === "rejected"
                ? {
                    pan: "rejected",
                    details: "rejected",
                    additional: "rejected",
                    offices: "rejected",
                    bank: "rejected",
                    einvoicing: "rejected",
                    ownership: "rejected",
                  }
                : selectedItem.sectionStatus;

          setSelectedItem({ ...selectedItem, status, sectionStatus });
        }
        fetchData();
      } else {
        toast.error("Failed to update status");
      }
    } catch (err) {
      toast.error("Network error");
    }
  };

  const handleUpdateSectionStatus = async (
    userId: string,
    section: string,
    status: string,
    reason?: string,
  ) => {
    try {
      const res = await api.post(
        "/api/admin/section-status",
        { userId, section, status, rejectionReason: reason },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        },
      );
      if (res.ok) {
        toast.success(`${section} status updated to ${status}`);
        if (selectedItem && selectedItem._id === userId) {
          const updatedSectionStatus = {
            ...(selectedItem.sectionStatus || {
              pan: "pending",
              details: "pending",
              additional: "pending",
              offices: "pending",
              bank: "pending",
              einvoicing: "pending",
              ownership: "pending",
            }),
            [section]: status,
          };
          setSelectedItem({
            ...selectedItem,
            sectionStatus: updatedSectionStatus,
          });

          // Status logic is now handled more strictly by the backend,
          // but we update the local state for immediate feedback
          const statuses = Object.values(updatedSectionStatus);
          let newStatus = "under_compliance_review";
          if (statuses.every((s) => s === "approved"))
            newStatus = "approved_for_procurement";
          else if (statuses.some((s) => s === "rejected"))
            newStatus = "rejected";
          else if (statuses.some((s) => s === "resubmission_required"))
            newStatus = "resubmission_required";

          setSelectedItem({
            ...selectedItem,
            onboardingStatus: newStatus,
            sectionStatus: updatedSectionStatus,
          });
        }
        fetchData();
      } else {
        toast.error("Failed to update section status");
      }
    } catch (err) {
      toast.error("Network error");
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
        return (
          <Badge
            variant="warning"
            className="rounded-full px-4 border-2 border-blue-100 shadow-sm font-black uppercase text-[9px] tracking-widest text-blue-700 bg-blue-50"
          >
            Under Compliance Review
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
          "einvoicing",
          "ownership",
        ];

  const getProgress = (item: any) => {
    if (!item?.sectionStatus) return 0;
    const sections = getSections(item);
    const count = sections.filter(
      (section) => item.sectionStatus?.[section] === "approved",
    ).length;
    return Math.round((count / sections.length) * 100);
  };

  const getEntityName = (item: any) =>
    item.profile?.businessName || item.profile?.organizationName || "N/A";
  const getPrimaryCategory = (item: any) =>
    item.role === "buyer"
      ? item.profile?.procurementCategories?.[0] || "General Procurement"
      : Array.isArray(item.profile?.productCategories)
        ? item.profile.productCategories[0]
        : item.profile?.industry || "Manufacturing";
  const getSubmittedDate = (item: any) =>
    new Date(item.createdAt || Date.now());
  const isPendingStatus = (status: string) =>
    ["pending", "pending_validation", "under_compliance_review"].includes(
      status,
    );

  const filterData = (data: any[]) => {
    const term = searchTerm.trim().toLowerCase();
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
        if (sortBy === "progress") return getProgress(b) - getProgress(a);
        if (sortBy === "entity")
          return getEntityName(a).localeCompare(getEntityName(b));
        if (sortBy === "status")
          return String(a.onboardingStatus || "").localeCompare(String(b.onboardingStatus || ""));
        if (sortBy === "category")
          return getPrimaryCategory(a).localeCompare(getPrimaryCategory(b));
        return getSubmittedDate(b).getTime() - getSubmittedDate(a).getTime();
      });
  };

  const currentData =
    activeTab === "sellers" ? filterData(sellers) : filterData(buyers);

  const pendingTotal =
    sellers.filter((s) =>
      ["pending", "pending_validation", "under_compliance_review"].includes(
        s.onboardingStatus,
      ),
    ).length +
    buyers.filter((b) =>
      ["pending", "pending_validation", "under_compliance_review"].includes(
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
    const map: Record<string, string> = {
      name: "entity",
      entity: "entity",
      category: "category",
      submitted: sortBy === "oldest" ? "newest" : "oldest",
      progress: "progress",
      status: "status",
    };
    setSortBy(map[key] || "newest");
  };

  const SortTableHead = ({
    label,
    sortKey,
    className = "",
  }: {
    label: string;
    sortKey: string;
    className?: string;
  }) => (
    <TableHead className={cn("px-6 py-4", className)}>
      <button
        type="button"
        onClick={() => toggleAdminSort(sortKey)}
        className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-[#12335f]"
      >
        {label}
        <span className="text-[9px]">SORT</span>
      </button>
    </TableHead>
  );

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
      "Submitted Date": getSubmittedDate(item).toISOString().split("T")[0],
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

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:sticky lg:top-20 lg:self-start">
            <p className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
              Admin Workbench
            </p>
            {[
              {
                id: "applications",
                label: "Applications Registry",
                icon: ClipboardCheck,
                hint: `${totalNetwork} records`,
              },
              {
                id: "scrutiny",
                label: "Scrutiny Queue",
                icon: Clock,
                hint: `${pendingTotal} pending`,
              },
              {
                id: "reports",
                label: "MIS & Compliance",
                icon: BarChart3,
                hint: `${averageProgress}% avg progress`,
              },
              {
                id: "flags",
                label: "Correction Flags",
                icon: AlertTriangle,
                hint: `${correctionTotal + rejectedTotal} flagged`,
              },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setAdminView(item.id);
                  if (item.id === "scrutiny") setStatusFilter("pending");
                  if (item.id === "flags")
                    setStatusFilter(
                      correctionTotal > 0 ? "resubmission" : "rejected",
                    );
                  if (item.id === "applications") setStatusFilter("all");
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-all",
                  adminView === item.id
                    ? "bg-[#12335f] text-white shadow-md"
                    : "text-slate-600 hover:bg-slate-50",
                )}
              >
                <item.icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    adminView === item.id ? "text-white" : "text-[#12335f]",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-black">
                    {item.label}
                  </span>
                  <span
                    className={cn(
                      "block text-[10px] font-bold",
                      adminView === item.id
                        ? "text-blue-100"
                        : "text-slate-400",
                    )}
                  >
                    {item.hint}
                  </span>
                </span>
              </button>
            ))}
          </aside>

          <div className="min-w-0 space-y-6">
            {/* Stats Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
                  className="text-left"
                >
                  <Card className="border border-slate-100 shadow-sm rounded-2xl overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                            {stat.label}
                          </p>
                          <p className="text-2xl font-black text-slate-900 tracking-tighter">
                            {stat.value}
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
              <div className="grid grid-cols-1 gap-4 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm md:grid-cols-3">
                <div className="rounded-xl bg-blue-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">
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
                <div className="p-6 space-y-4 bg-slate-50/50">
                  <div className="flex flex-col gap-2">
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
                  </div>
                  <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
                    <div className="relative w-full max-w-xl">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input
                        placeholder="Search by company, PAN, GST, state, or applicant name..."
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                    <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3 md:w-auto">
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-wide text-slate-600 outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="all">All Status</option>
                        <option value="pending">Pending / Review</option>
                        <option value="approved">Approved</option>
                        <option value="resubmission">
                          Correction Required
                        </option>
                        <option value="rejected">Rejected</option>
                      </select>
                      <select
                        value={progressFilter}
                        onChange={(e) => setProgressFilter(e.target.value)}
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
                        className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-black uppercase tracking-wide text-slate-600 outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="newest">Newest First</option>
                        <option value="oldest">Oldest First</option>
                        <option value="progress">Progress High</option>
                        <option value="entity">Entity A-Z</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSearchTerm("");
                        setStatusFilter("all");
                        setProgressFilter("all");
                        setSortBy("newest");
                      }}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-slate-500 hover:text-[#12335f]"
                    >
                      <RefreshCw className="h-3 w-3" /> Reset Filters
                    </button>
                    {adminView !== "applications" && (
                      <span className="rounded-full bg-blue-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-blue-700">
                        View: {adminView.replace("_", " ")}
                      </span>
                    )}
                  </div>
                </div>

                {isLoading ? (
                  <div className="py-20 text-center text-slate-400 animate-pulse">
                    Scanning database registrations...
                  </div>
                ) : currentData.length === 0 ? (
                  <div className="py-20 text-center text-slate-400 border-2 border-dashed border-slate-100 m-6 rounded-2xl">
                    No {activeTab} registrations in record.
                  </div>
                ) : (
                  <>
                    {/* Responsive Table for Desktop */}
                    <div className="hidden md:block overflow-x-auto no-scrollbar">
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
                          {currentData.map((item, index) => (
                            <TableRow
                              key={item._id}
                              className="group hover:bg-slate-50/50 transition-colors border-b border-slate-50"
                            >
                              <TableCell className="px-6 py-8">
                                <div className="font-mono text-xs font-black text-slate-400">
                                  {String(index + 1).padStart(2, "0")}
                                </div>
                              </TableCell>
                              <TableCell className="px-6 py-8">
                                <div className="font-bold text-slate-800 text-xs tracking-tight">
                                  {item.name}
                                </div>
                                <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                  {item.role || activeTab.replace(/s$/, "")}
                                </div>
                              </TableCell>
                              <TableCell className="px-6 py-8">
                                <div className="font-bold text-slate-600 text-xs underline decoration-indigo-200 underline-offset-4">
                                  {getEntityName(item)}
                                </div>
                                <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                  {item.profile?.state || "State N/A"}
                                </div>
                              </TableCell>
                              <TableCell className="px-6 py-8">
                                <div className="space-y-1">
                                  <div className="text-[10px] font-black text-indigo-600 uppercase">
                                    {item.role === "buyer"
                                      ? item.profile?.annualBudget ||
                                        "Budget N/A"
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
                                  {
                                    getSubmittedDate(item)
                                      .toISOString()
                                      .split("T")[0]
                                  }
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
                                    setSelectedItem(item);
                                    setFeedback(item.adminFeedback || "");
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

                    {/* Responsive Card Grid for Mobile */}
                    <div className="md:hidden divide-y divide-slate-100">
                      {currentData.map((item, index) => (
                        <div key={item._id} className="p-4 space-y-4">
                          <div className="flex justify-between items-start">
                            <div className="flex gap-3">
                              <div className="font-mono text-[10px] font-black text-slate-400">
                                {String(index + 1).padStart(2, "0")}
                              </div>
                              <div className="space-y-1">
                                <div className="font-bold text-slate-800 text-xs tracking-tight">
                                  {item.name}
                                </div>
                                <div className="font-bold text-slate-500 text-[10px] underline decoration-indigo-200 underline-offset-2">
                                  {getEntityName(item)}
                                </div>
                                <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
                                  {item.profile?.state || "State N/A"}
                                </div>
                              </div>
                            </div>
                            {getStatusBadge(item.onboardingStatus)}
                          </div>

                          <div className="flex justify-between items-end">
                            <div className="space-y-2">
                              <div className="text-[10px] font-black text-indigo-600 uppercase">
                                {item.role === "buyer"
                                  ? item.profile?.annualBudget || "Budget N/A"
                                  : getPrimaryCategory(item)}
                              </div>
                              <div className="text-[10px] font-bold uppercase text-slate-400">
                                Verification: {getProgress(item)}%
                              </div>
                              <div className="flex space-x-0.5">
                                {getSections(item).map((section) => (
                                  <div
                                    key={section}
                                    className={
                                      cn(
                                        "h-1 w-4 rounded-full",
                                        item.sectionStatus?.[section] ===
                                          "approved"
                                          ? "bg-green-500"
                                          : item.sectionStatus?.[section] ===
                                              "rejected"
                                            ? "bg-red-500"
                                            : "bg-slate-200",
                                      ) || ""
                                    }
                                  />
                                ))}
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                setSelectedItem(item);
                                setFeedback(item.adminFeedback || "");
                              }}
                              className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-black uppercase"
                            >
                              Review
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* FULL SCREEN REVIEW OVERLAY */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b1f3a]/80 p-2 animate-in fade-in duration-300 md:p-4">
          <div className="flex h-[95dvh] w-full max-w-[1300px] flex-col overflow-hidden rounded-lg border border-slate-300 bg-white shadow-2xl animate-in zoom-in-95 duration-300">
            {/* Header */}
            <div className="relative z-10 flex items-center justify-between border-b border-slate-200 bg-[#12335f] px-6 py-4 text-white md:px-8">
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-100">
                  Registration Scrutiny Desk
                </p>
                <h2 className="text-lg font-extrabold uppercase leading-none tracking-tight md:text-xl">
                  Application Review
                </h2>
                <p className="text-xs font-medium text-blue-100">
                  Detailed participant verification and compliance decision
                  module
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
                          <div className="mt-3 inline-flex rounded border border-blue-100 bg-blue-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-[#12335f]">
                            ID:{" "}
                            {selectedItem.registrationDetails?.userId ||
                              selectedItem.name
                                .toUpperCase()
                                .replace(/\s+/g, "-")}
                          </div>
                        </div>
                      </div>
                      <div className="flex pt-3 border-t border-slate-200/50">
                        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wider text-amber-800">
                          Under Compliance Review
                        </div>
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
                        selectedItem.status === "approved_for_procurement"
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
                            <div className="w-9 h-9 rounded-md bg-blue-50 text-[#12335f] flex items-center justify-center shadow-sm">
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
                        <div className="grid md:grid-cols-2 gap-8">
                          <InfoItem
                            label="Organization Name"
                            value={selectedItem.profile?.organizationName}
                            highlight
                          />
                          <InfoItem
                            label="Business Type"
                            value={selectedItem.profile?.businessType}
                          />
                          <InfoItem
                            label="Industry"
                            value={selectedItem.profile?.industry}
                          />
                          <InfoItem
                            label="PAN"
                            value={selectedItem.profile?.pan}
                            mono
                            highlight
                          />
                          <InfoItem
                            label="CIN"
                            value={selectedItem.profile?.cin}
                          />
                          <InfoItem
                            label="GST"
                            value={selectedItem.profile?.gst}
                          />
                          <InfoItem
                            label="Website"
                            value={selectedItem.profile?.website}
                          />
                          <InfoItem
                            label="State"
                            value={selectedItem.profile?.state}
                            highlight
                          />
                          <InfoItem
                            label="District"
                            value={selectedItem.profile?.district}
                            highlight
                          />
                          <InfoItem
                            label="Office/Zone"
                            value={selectedItem.profile?.officeZoneName}
                          />
                        </div>
                      </div>

                      {/* Buyer Section 2: Rep */}
                      <div className="group rounded-lg border border-slate-200 bg-white p-5 shadow-sm animate-in slide-in-from-bottom-4 duration-300 delay-75">
                        <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-100 relative">
                          <div className="flex items-center space-x-3">
                            <div className="w-9 h-9 rounded-md bg-blue-50 text-[#12335f] flex items-center justify-center shadow-sm">
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
                            value={selectedItem.profile?.representativeName}
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
                            value={selectedItem.profile?.email}
                          />
                          <InfoItem
                            label="Mobile Number"
                            value={selectedItem.profile?.mobile}
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
                            <div className="w-9 h-9 rounded-md bg-blue-50 text-[#12335f] flex items-center justify-center shadow-sm">
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
                        </div>
                      </div>

                      {/* Buyer Section 4: Procurement */}
                      <div className="group rounded-lg border border-slate-200 bg-white p-5 shadow-sm animate-in slide-in-from-bottom-4 duration-300">
                        <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-100 relative">
                          <div className="flex items-center space-x-3">
                            <div className="w-9 h-9 rounded-md bg-blue-50 text-[#12335f] flex items-center justify-center shadow-sm">
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
                              value={selectedItem.profile?.procurementCategories?.join(
                                ", ",
                              )}
                              highlight
                            />
                          </div>
                          <div className="md:col-span-2">
                            <InfoItem
                              label="Preferred Methods"
                              value={selectedItem.profile?.preferredMethods?.join(
                                ", ",
                              )}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Buyer Section 5: Documents */}
                      <div className="group rounded-lg border border-slate-200 bg-white p-5 pb-6 shadow-sm animate-in slide-in-from-bottom-4 duration-300">
                        <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-100 relative">
                          <div className="flex items-center space-x-3">
                            <div className="w-9 h-9 rounded-md bg-blue-50 text-[#12335f] flex items-center justify-center shadow-sm">
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
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {selectedItem.profile?.documents &&
                            Object.entries(selectedItem.profile.documents).map(
                              ([key, url]: [string, any]) =>
                                url && (
                                  <div
                                    key={key}
                                    className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-2"
                                  >
                                    <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                                      {key}
                                    </p>
                                    <a
                                      href={url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-xs font-bold text-[#12335f] hover:underline flex items-center gap-1"
                                    >
                                      <Eye className="h-3 w-3" /> View Document
                                    </a>
                                  </div>
                                ),
                            )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Section 1: PAN */}
                      <div className="group rounded-lg border border-slate-200 bg-white p-5 shadow-sm animate-in slide-in-from-bottom-4 duration-300">
                        <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-100 relative">
                          <div className="flex items-center space-x-3">
                            <div className="w-9 h-9 rounded-md bg-blue-50 text-[#12335f] flex items-center justify-center shadow-sm">
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
                        </div>
                      </div>

                      {/* Section 2: Details */}
                      <div className="group rounded-lg border border-slate-200 bg-white p-5 shadow-sm animate-in slide-in-from-bottom-4 duration-300 delay-75">
                        <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-100 relative">
                          <div className="flex items-center space-x-3">
                            <div className="w-9 h-9 rounded-md bg-blue-50 text-[#12335f] flex items-center justify-center shadow-sm">
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
                        </div>
                      </div>

                      {/* Section 3: Additional */}
                      <div className="group rounded-lg border border-slate-200 bg-white p-5 shadow-sm animate-in slide-in-from-bottom-4 duration-300">
                        <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-100 relative">
                          <div className="flex items-center space-x-3">
                            <div className="w-9 h-9 rounded-md bg-blue-50 text-[#12335f] flex items-center justify-center shadow-sm">
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
                        </div>
                      </div>

                      {/* Section 4: Offices */}
                      <div className="group rounded-lg border border-slate-200 bg-white p-5 shadow-sm animate-in slide-in-from-bottom-4 duration-300">
                        <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-100 relative">
                          <div className="flex items-center space-x-3">
                            <div className="w-9 h-9 rounded-md bg-blue-50 text-[#12335f] flex items-center justify-center shadow-sm">
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
                                <p className="text-xs font-extrabold text-slate-900 uppercase">
                                  {office.name}{" "}
                                  <span className="text-[10px] font-bold text-[#12335f] bg-blue-50 px-2 py-0.5 rounded-full ml-2">
                                    {office.type}
                                  </span>
                                </p>
                                <p className="text-[11px] font-medium text-slate-600 uppercase">
                                  {office.address}
                                </p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                  {office.city}, {office.state} -{" "}
                                  {office.pincode}
                                </p>
                              </div>
                              {office.gstRegistered && (
                                <Badge variant="success" className="text-[8px]">
                                  GST REG
                                </Badge>
                              )}
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
                            <div className="w-9 h-9 rounded-md bg-blue-50 text-[#12335f] flex items-center justify-center shadow-sm">
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
                      <div className="group rounded-lg border border-slate-200 bg-white p-5 shadow-sm animate-in slide-in-from-bottom-4 duration-300">
                        <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-100 relative">
                          <div className="flex items-center space-x-3">
                            <div className="w-9 h-9 rounded-md bg-blue-50 text-[#12335f] flex items-center justify-center shadow-sm">
                              <FileText className="h-4 w-4" />
                            </div>
                            <h4 className="text-xs font-extrabold text-[#12335f] uppercase tracking-wide">
                              6. e-Invoicing
                            </h4>
                          </div>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() =>
                                handleUpdateSectionStatus(
                                  selectedItem._id,
                                  "einvoicing",
                                  "approved",
                                )
                              }
                              className={cn(
                                "w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all shadow-sm",
                                selectedItem.sectionStatus?.einvoicing ===
                                  "approved"
                                  ? "bg-green-500 border-green-600 text-white"
                                  : "bg-white border-slate-200 text-slate-300 hover:bg-green-50 hover:text-green-600 hover:border-green-300",
                              )}
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => openRejectionModal("einvoicing")}
                              className={cn(
                                "w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all shadow-sm",
                                selectedItem.sectionStatus?.einvoicing ===
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
                            label="Turnover (Last 3 yrs)"
                            value={selectedItem.profile?.turnoverMax3Yrs}
                            highlight
                          />
                          <InfoItem
                            label="Excluded Status"
                            value={
                              selectedItem.profile?.eInvoicingExcluded
                                ? "EXEMPT"
                                : "APPLICABLE"
                            }
                          />
                        </div>
                      </div>

                      {/* Section 7: Ownership */}
                      <div className="group rounded-lg border border-slate-200 bg-white p-5 pb-6 shadow-sm animate-in slide-in-from-bottom-4 duration-300">
                        <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-100 relative">
                          <div className="flex items-center space-x-3">
                            <div className="w-9 h-9 rounded-md bg-blue-50 text-[#12335f] flex items-center justify-center shadow-sm">
                              <ShieldCheck className="h-4 w-4" />
                            </div>
                            <h4 className="text-xs font-extrabold text-[#12335f] uppercase tracking-wide">
                              7. Beneficial Ownership
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
                <p className="text-[10px] font-bold uppercase tracking-wider text-blue-100">
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
