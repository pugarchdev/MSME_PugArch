import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';

interface GeMProfileHeaderProps {
  companyName: string;
  completionPercentage: number;
  warnings: string[];
  onMenuClick?: () => void;
}

export const GeMProfileHeader: React.FC<GeMProfileHeaderProps> = ({
  companyName,
  completionPercentage,
  warnings,
  onMenuClick
}) => {
  return (
    <div className="bg-white border-b border-gray-200 p-2 space-y-2 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {onMenuClick && (
            <button 
              onClick={onMenuClick}
              className="md:hidden p-2 rounded-xl bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          )}
          <div>
            <h2 className="text-[14px] sm:text-xl font-black text-gray-900 uppercase tracking-tight">Seller Profile</h2>
            <p className="text-gray-500 font-bold text-[10px] sm:text-sm line-clamp-1">{companyName || "Organization Name Not Set"}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
           <div className="relative h-16 w-16">
             <svg className="h-full w-full" viewBox="0 0 36 36">
               <path
                 className="text-gray-100 stroke-current"
                 strokeWidth="3"
                 fill="none"
                 d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
               />
               <path
                 className="text-blue-600 stroke-current"
                 strokeWidth="3"
                 strokeDasharray={`${completionPercentage}, 100`}
                 strokeLinecap="round"
                 fill="none"
                 d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
               />
               <text x="18" y="20.35" className="text-[8px] font-black fill-current text-blue-700" textAnchor="middle">{completionPercentage}%</text>
             </svg>
           </div>
           <div className="hidden sm:block text-right">
             <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Profile Completion</p>
             <p className="text-xs font-bold text-gray-700">Target 100% for Full Access</p>
           </div>
        </div>
      </div>
{/* 
      {warnings.length > 0 && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r-xl flex gap-3 animate-in slide-in-from-top-2 duration-300">
          <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0" />
          <div className="space-y-1">
            <p className="text-xs font-black text-yellow-800 uppercase tracking-widest">Action Required</p>
            <ul className="text-xs font-medium text-yellow-700 space-y-1 list-disc list-inside ">
              {warnings.map((warning, i) => (
                <li key={i}>{warning}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
       */}
      
    </div>
  );
};
