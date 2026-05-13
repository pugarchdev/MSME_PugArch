import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { toast } from 'sonner';
import { ShieldCheck, Lock, Mail, Key, Eye, EyeOff } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!user) return;

    const destination =
      (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/dashboard';

    navigate(destination, { replace: true });
  }, [user, navigate, location.state]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const res = await api.post('/api/auth/login', { email, password });
      const data = await res.json();
      
      if (res.ok) {
        login(data.token, data.user);
        toast.success(`Welcome back, ${data.user.name}!`);
      } else {
        toast.error(data.message || 'Login failed');
      }
    } catch (err) {
      toast.error('Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-slate-50 px-3 py-6 sm:px-4">
      {/* BACKGROUND DECORATIONS */}
      <div className="absolute top-[-10%] left-[-10%] h-[40%] w-[40%] rounded-full bg-blue-200/40 blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] h-[40%] w-[40%] rounded-full bg-slate-200/40 blur-[120px] animate-pulse" />
      
      <Card className="animate-in relative z-10 w-full max-w-[400px] overflow-hidden rounded-[2.5rem] border border-white/40 bg-white/70 backdrop-blur-2xl shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] fade-in zoom-in duration-700">
        <CardHeader className="relative bg-gradient-to-br from-[#0b1b33] via-[#12335f] to-[#0b1b33] pb-6 pt-8 text-center text-white">
          <div className="absolute top-0 right-0 p-6 opacity-5">
             <ShieldCheck className="h-32 w-32" />
          </div>
          <div className="relative mx-auto w-12 h-12 bg-white/10 backdrop-blur-xl border border-white/20 rounded-[1.25rem] flex items-center justify-center mb-4 shadow-2xl rotate-3 hover:rotate-0 transition-transform duration-500">
            <Lock className="h-5 w-5 text-blue-300" />
          </div>
          <CardTitle className="text-2xl font-black uppercase tracking-tight sm:text-3xl text-white">
            <span className="block text-[#f9a825] text-[10px] tracking-[0.3em] mb-1 text-center">Secure Portal</span>
            Stakeholder Access
          </CardTitle>
          <p className="text-[10px] font-bold text-slate-400 mt-3 uppercase tracking-[0.2em]  opacity-80 text-center">PugArch Procurement Network</p>
        </CardHeader>

        <CardContent className="p-5 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
               <label className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em]  ml-1">Official Email</label>
               <div className="group relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-[#12335f] transition-colors" />
                  <input
                    type="email"
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full h-12 pl-12 pr-4 rounded-2xl border border-slate-200 bg-white/50 text-sm focus:outline-none focus:ring-2 focus:ring-[#12335f]/20 focus:border-[#12335f] transition-all font-semibold"
                  />
               </div>
            </div>

            <div className="space-y-2">
               <label className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em]  ml-1">Secure Password</label>
               <div className="group relative">
                   <Key className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-[#12335f] transition-colors" />
                   <input
                     type={showPassword ? "text" : "password"}
                     placeholder="••••••••"
                     value={password}
                     onChange={(e) => setPassword(e.target.value)}
                     required
                     className="w-full h-12 pl-12 pr-12 rounded-2xl border border-slate-200 bg-white/50 text-sm focus:outline-none focus:ring-2 focus:ring-[#12335f]/20 focus:border-[#12335f] transition-all font-semibold"
                   />
                   <button
                     type="button"
                     onClick={() => setShowPassword(!showPassword)}
                     className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#12335f] focus:outline-none transition-colors"
                   >
                     {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                   </button>
               </div>
            </div>

            <div className="pt-2">
              <Button 
                type="submit" 
                className="w-full h-12 rounded-[1.25rem] bg-gradient-to-r from-[#12335f] to-[#0b2445] hover:from-[#0b2445] hover:to-[#071830] text-white font-black uppercase tracking-[0.2em]  shadow-[0_20px_40px_-10px_rgba(18,51,95,0.3)] transition-all hover:translate-y-[-2px] active:scale-[0.98] disabled:opacity-50" 
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                    Authenticating...
                  </span>
                ) : 'Sign In Now'}
              </Button>
            </div>

            <div className="text-center py-2">
              <p className="text-xs font-bold text-slate-500">
                New to the platform?{' '}
                <Link to="/seller/register" className="text-[#12335f] font-black uppercase hover:text-[#0b2445] transition-colors underline decoration-blue-200 underline-offset-4 decoration-2">Create Profile</Link>
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
