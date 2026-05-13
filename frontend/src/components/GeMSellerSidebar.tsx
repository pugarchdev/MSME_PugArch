import React from 'react';
import { cn } from '../lib/utils';
import { CheckCircle2, Circle, Lock } from 'lucide-react';

interface SidebarItemProps {
  id: string;
  label: string;
  status: 'completed' | 'pending' | 'locked';
  isActive: boolean;
  onClick: (id: string) => void;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ id, label, status, isActive, onClick }) => {
  return (
    <button
      onClick={() => status !== 'locked' && onClick(id)}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-3 text-left transition-all",
        isActive ? "bg-blue-50 border-r-4 border-blue-600" : "hover:bg-gray-50",
        status === 'locked' ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      )}
    >
      <div className="flex-shrink-0">
        {status === 'completed' ? (
          <CheckCircle2 className="h-5 w-5 text-green-500" />
        ) : status === 'locked' ? (
          <Lock className="h-5 w-5 text-gray-400" />
        ) : (
          <Circle className={cn("h-5 w-5", isActive ? "text-blue-600" : "text-gray-300")} />
        )}
      </div>
      <span className={cn(
        "text-sm font-semibold",
        isActive ? "text-blue-700" : "text-gray-600",
        status === 'completed' && !isActive && "text-gray-800"
      )}>
        {label}
      </span>
    </button>
  );
};

const AccountSidebarItem: React.FC<{ id: string, label: string, isActive: boolean, onClick: (id: string) => void }> = ({ id, label, isActive, onClick }) => {
  return (
    <button
      onClick={() => onClick(id)}
      className={cn(
        "flex w-full items-center gap-3 pl-8 py-2.5 text-left transition-all border-l-4 text-sm",
        isActive 
          ? "bg-slate-50 border-blue-600 font-bold text-slate-800" 
          : "border-transparent hover:bg-slate-50 text-slate-600 font-medium"
      )}
    >
      {label}
    </button>
  );
};

interface GeMSellerSidebarProps {
  currentSection: string;
  onSectionChange: (id: string) => void;
  sectionStatus: Record<string, 'completed' | 'pending' | 'locked'>;
  isOpen?: boolean;
  onClose?: () => void;
}

export const GeMSellerSidebar: React.FC<GeMSellerSidebarProps> = ({ 
  currentSection, 
  onSectionChange,
  sectionStatus,
  isOpen,
  onClose
}) => {
  const mandatoryItems = [
    { id: 'pan', label: '1. Business PAN Validation' },
    { id: 'details', label: '2. Business Details' },
    { id: 'additional', label: '3. Additional Details' },
    { id: 'offices', label: '4. Office Locations' },
    { id: 'bank', label: '5. Bank Accounts' },
    { id: 'einvoicing', label: '6. e-Invoicing' },
    { id: 'ownership', label: '7. Beneficial Ownership' },
  ];

  // const optionalItems = [
  //   { id: 'tax', label: '8. Tax Assessment' },
  //   { id: 'logistics', label: '9. Logistics' },
  //   { id: 'tan', label: '10. TAN Validation' },
  // ];

  const accountItems = [
    { id: 'sellerProfile', label: 'Seller Profile' },
    { id: 'updateAadhaar', label: 'Update Aadhaar' },
    { id: 'changePassword', label: 'Change Password' },
    { id: 'changeEmail', label: 'Change Email' },
    { id: 'closeAccount', label: 'Close Account' },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm md:hidden"
          onClick={onClose}
        />
      )}

      <div className={cn(
        "w-72 flex-shrink-0 bg-white border-r border-gray-200 min-h-screen shadow-sm overflow-y-auto transition-transform duration-300 md:translate-x-0 fixed md:static left-0 top-0 z-50 h-full",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Business Profile</h3>
          {onClose && (
            <button onClick={onClose} className="md:hidden p-1 rounded-lg hover:bg-gray-100">
              <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        
        <div className="py-2">
          <div className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase">Mandatory</div>
          {mandatoryItems.map(item => (
            <SidebarItem
              key={item.id}
              id={item.id}
              label={item.label}
              status={sectionStatus[item.id] || 'pending'}
              isActive={currentSection === item.id}
              onClick={(id) => {
                onSectionChange(id);
                if (onClose) onClose();
              }}
            />
          ))}
        </div>

        {/* <div className="py-2 border-t border-gray-100">
          <div className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase">Optional</div>
          {optionalItems.map(item => (
            <SidebarItem
              key={item.id}
              id={item.id}
              label={item.label}
              status={sectionStatus[item.id] || 'pending'}
              isActive={currentSection === item.id}
              onClick={(id) => {
                onSectionChange(id);
                if (onClose) onClose();
              }}
            />
          ))}
        </div> */}

        {/* <div className="py-2 bg-gray-50/50 border-t border-gray-100 text-gray-500 font-semibold text-sm px-4 py-3 opacity-60">
           11. Vendor Assessment
        </div> */}

        <div className="py-2 border-t border-gray-100">
          <div className="px-4 py-2 text-[10px] font-bold text-blue-600 uppercase">Account Settings</div>
          {accountItems.map(item => (
            <AccountSidebarItem
              key={item.id}
              id={item.id}
              label={item.label}
              isActive={currentSection === item.id}
              onClick={(id) => {
                onSectionChange(id);
                if (onClose) onClose();
              }}
            />
          ))}
        </div>

        {/* <div className="py-2 bg-gray-50/50 border-t border-gray-100 text-gray-500 font-semibold text-sm px-4 py-3 opacity-60 mb-10">
           13. User Management
        </div> */}
      </div>
    </>
  );
};
