import React, { useEffect, useState } from 'react';

const LOADING_STEPS = [
  'Initializing JSG SMILE Portal...',
  'Securing connection gateway...',
  'Verifying digital signatures...',
  'Syncing industry linkage register...',
  'Loading MSME core modules...',
  'Optimizing dashboard views...',
  'Establishing secure database tunnel...',
  'Starting JsgSmile services...'
];

export default function PremiumLoader() {
  const [stepIndex, setStepIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  // Cycle through loading status messages
  useEffect(() => {
    const textInterval = setInterval(() => {
      setStepIndex((prev) => (prev + 1) % LOADING_STEPS.length);
    }, 900);

    return () => clearInterval(textInterval);
  }, []);

  // Animate the progress bar smoothly up to 98% (clamped until page load unmounts it)
  useEffect(() => {
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 98) {
          clearInterval(progressInterval);
          return 98;
        }
        // Progress faster in the beginning, then slow down
        const remaining = 98 - prev;
        const increment = Math.max(1, Math.min(12, Math.floor(Math.random() * (remaining * 0.25))));
        return prev + increment;
      });
    }, 300);

    return () => clearInterval(progressInterval);
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-gradient-to-br from-[#07172e] via-[#0b2447] to-[#040e1d] overflow-hidden select-none">
      {/* Background ambient lighting/glows */}
      <div className="absolute top-1/4 left-1/4 w-[35rem] h-[35rem] rounded-full bg-blue-500/10 blur-[120px] pointer-events-none animate-pulse" style={{ animationDuration: '8s' }} />
      <div className="absolute bottom-1/4 right-1/4 w-[30rem] h-[30rem] rounded-full bg-amber-500/5 blur-[100px] pointer-events-none animate-pulse" style={{ animationDuration: '6s' }} />
      
      {/* Inner glass card */}
      <div className="relative z-10 flex flex-col items-center justify-center p-8 md:p-12 rounded-2xl border border-white/10 bg-[#07172e]/60 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] max-w-sm md:max-w-md w-[calc(100%-2rem)] mx-4">
        
        {/* Subtle top tricolor highlight */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-4/5 h-[3px] rounded-b-full bg-gradient-to-r from-brand-saffron via-white to-brand-green opacity-90 shadow-[0_0_15px_rgba(255,255,255,0.2)]" />
        
        {/* Logo Container with pulse & glow */}
        <div className="relative w-28 h-28 mb-6 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-brand-gold/10 to-brand-saffron/10 blur-xl animate-pulse" />
          <img 
            src="/msme-logo.png" 
            alt="JsgSmile Logo" 
            className="w-24 h-24 object-contain filter drop-shadow-[0_4px_12px_rgba(200,164,92,0.3)] animate-pulse"
            style={{ animationDuration: '3s' }}
          />
        </div>

        {/* Text Headers */}
        <h1 className="text-xl md:text-2xl font-bold tracking-widest text-white uppercase text-center bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
          JSG SMILE PORTAL
        </h1>
        
        <div className="w-16 h-[2px] bg-brand-gold/40 my-3 rounded-full" />
        
        <p className="text-xs md:text-sm font-medium tracking-wide text-slate-300 text-center max-w-xs leading-relaxed">
          Jharsuguda Synergy for MSME & Industry Linkage Ecosystem
        </p>

        {/* Animated Concentric Rings */}
        <div className="relative flex items-center justify-center my-8 w-20 h-20">
          {/* Outer spin track */}
          <div className="absolute inset-0 rounded-full border border-white/5" />
          <div 
            className="absolute inset-0 rounded-full border-t-2 border-r-2 border-brand-gold animate-spin" 
            style={{ animationDuration: '1.4s' }} 
          />
          {/* Inner counter-rotating ring */}
          <div 
            className="absolute inset-2 rounded-full border-b-2 border-l-2 border-brand-saffron animate-spin" 
            style={{ animationDuration: '0.9s', animationDirection: 'reverse' }} 
          />
          {/* Central status light */}
          <div className="w-6 h-6 rounded-full bg-brand-gold/10 flex items-center justify-center border border-brand-gold/20">
            <div className="w-2 h-2 rounded-full bg-brand-gold animate-ping" />
          </div>
        </div>

        {/* Custom Progress Bar */}
        <div className="w-full space-y-2.5">
          <div className="flex justify-between items-center text-[10px] md:text-xs font-mono text-slate-400">
            <span className="animate-pulse">{LOADING_STEPS[stepIndex]}</span>
            <span className="text-brand-gold font-bold">{progress}%</span>
          </div>
          
          <div className="w-full h-1.5 bg-slate-950/75 rounded-full overflow-hidden border border-white/5 backdrop-blur-sm">
            <div 
              className="h-full bg-gradient-to-r from-brand-gold via-brand-saffron to-brand-green rounded-full transition-all duration-300 ease-out shadow-[0_0_8px_rgba(200,164,92,0.4)]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Footer Credentials */}
      <div className="absolute bottom-6 flex flex-col items-center justify-center space-y-1 z-10 text-[9px] md:text-[10px] text-slate-400 font-mono tracking-widest uppercase text-center opacity-70">
        <div>Government of Odisha • District Administration Jharsuguda</div>
        <div className="text-[8px] text-slate-500">Secure 256-Bit SSL Connection</div>
      </div>
    </div>
  );
}
