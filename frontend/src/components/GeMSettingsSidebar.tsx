import React, { useState } from 'react';
import { cn } from '../lib/utils';
import { ChevronDown, ChevronRight, User, Settings, ShieldCheck, Mail, Lock, UserX, Users } from 'lucide-react';

interface SidebarCategoryProps {
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

const SidebarCategory: React.FC<SidebarCategoryProps> = ({ label, isOpen, onToggle, children }) => {
  return (
    <div className="border-b border-gray-100">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-sm font-bold text-gray-700 uppercase tracking-tight">{label}</span>
        {isOpen ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
      </button>
      {isOpen && <div className="bg-white">{children}</div>}
    </div>
  );
};

interface SidebarItemProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ label, isActive, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 px-8 py-3 text-left transition-all text-sm font-medium",
        isActive ? "bg-gray-50 text-blue-700 border-l-4 border-blue-600" : "text-gray-600 hover:bg-gray-50"
      )}
    >
      {label}
    </button>
  );
};

interface GeMSettingsSidebarProps {
  currentSection: string;
  onSectionChange: (id: string) => void;
}

export const GeMSettingsSidebar: React.FC<GeMSettingsSidebarProps> = ({ currentSection, onSectionChange }) => {
  const [openCategories, setOpenCategories] = useState<string[]>(['settings']);

  const toggleCategory = (id: string) => {
    setOpenCategories(prev => 
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  return (
    <div className="w-72 flex-shrink-0 bg-white border-r border-gray-200 min-h-screen shadow-sm overflow-y-auto">
      <SidebarCategory 
        label="Business Profile" 
        isOpen={openCategories.includes('business')} 
        onToggle={() => toggleCategory('business')}
      >
        {/* Business items could go here */}
      </SidebarCategory>

      <div className="px-6 py-4 border-b border-gray-100 text-sm font-bold text-gray-300 uppercase cursor-not-allowed">
        Vendor Assessment
      </div>

      <SidebarCategory 
        label="Account Settings" 
        isOpen={openCategories.includes('settings')} 
        onToggle={() => toggleCategory('settings')}
      >
        <SidebarItem 
          label="Seller Profile" 
          isActive={currentSection === 'profile'} 
          onClick={() => onSectionChange('profile')} 
        />
        <SidebarItem 
          label="Update Aadhaar" 
          isActive={currentSection === 'aadhaar'} 
          onClick={() => onSectionChange('aadhaar')} 
        />
        <SidebarItem 
          label="Change Password" 
          isActive={currentSection === 'password'} 
          onClick={() => onSectionChange('password')} 
        />
        <SidebarItem 
          label="Change Email" 
          isActive={currentSection === 'email'} 
          onClick={() => onSectionChange('email')} 
        />
        <SidebarItem 
          label="Close Account" 
          isActive={currentSection === 'close'} 
          onClick={() => onSectionChange('close')} 
        />
      </SidebarCategory>

      <div className="px-6 py-4 border-b border-gray-100 text-sm font-bold text-gray-300 uppercase cursor-not-allowed">
        User Management
      </div>
    </div>
  );
};
