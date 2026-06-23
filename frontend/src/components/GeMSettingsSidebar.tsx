import React from 'react';
import { cn } from '../lib/utils';
import { User, ShieldCheck, Mail, Lock, UserX, Building2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

interface GeMSettingsSidebarProps {
  currentSection: string;
  onSectionChange: (id: string) => void;
}

export const GeMSettingsSidebar: React.FC<GeMSettingsSidebarProps> = ({ currentSection, onSectionChange }) => {
  const { user } = useAuth();

  const sections = [
    { id: 'profile', label: user?.role === 'shg' ? 'SHG Profile' : 'Seller Profile', icon: User },
    ...(user?.role === 'shg' ? [] : [{ id: 'aadhaar', label: 'Update Aadhaar', icon: ShieldCheck }]),
    { id: 'branding', label: 'Logo & Branding', icon: Building2 },
    { id: 'password', label: 'Change Password', icon: Lock },
    { id: 'email', label: 'Change Email', icon: Mail },
    { id: 'close', label: 'Close Account', icon: UserX },
  ];

  return (
    <>
      {/* Mobile/Tablet Horizontal Tabs (hidden on lg and above) */}
      <div className="lg:hidden w-full bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
        <div className="flex flex-row overflow-x-auto no-scrollbar px-4 py-3 gap-2 whitespace-nowrap">
          {sections.map((section) => {
            const Icon = section.icon;
            const isActive = currentSection === section.id;
            return (
              <button
                key={section.id}
                onClick={() => onSectionChange(section.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-200 border",
                  isActive
                    ? "bg-[#12335f] border-[#12335f] text-white shadow-md shadow-[#12335f]/15"
                    : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 hover:text-gray-800"
                )}
              >
                <Icon className={cn("h-3.5 w-3.5", isActive ? "text-white" : "text-gray-400")} />
                {section.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Desktop Vertical Sidebar (hidden below lg) */}
      <div className="hidden lg:block w-72 flex-shrink-0 bg-white border-r border-gray-200 min-h-screen shadow-sm overflow-y-auto py-6">
        <div className="px-6 mb-4">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Account Settings</h3>
        </div>
        <div className="space-y-1">
          {sections.map((section) => {
            const Icon = section.icon;
            const isActive = currentSection === section.id;
            return (
              <button
                key={section.id}
                onClick={() => onSectionChange(section.id)}
                className={cn(
                  "flex w-full items-center gap-3 px-8 py-3.5 text-left transition-all text-sm font-bold uppercase tracking-wider border-l-4",
                  isActive
                    ? "bg-slate-50/50 text-[#12335f] border-blue-600"
                    : "text-gray-600 hover:bg-gray-50 border-transparent hover:text-gray-900"
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-[#12335f]" : "text-gray-400")} />
                {section.label}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
};
