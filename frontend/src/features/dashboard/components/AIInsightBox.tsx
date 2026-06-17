import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { dashboardAiApi, AIInsightResponse } from '../api';
import { 
  Sparkles, 
  Lightbulb, 
  AlertTriangle, 
  TrendingUp, 
  CheckSquare, 
  Bot, 
  HelpCircle, 
  Cpu, 
  RotateCw, 
  AlertCircle,
  X
} from 'lucide-react';
import { cn } from '../../../lib/utils';

interface AIInsightBoxProps {
  dashboardData: Record<string, any>;
}

interface InsightSection {
  title: string;
  content: string;
}

const SECTION_METADATA: Record<string, { icon: any; borderClass: string; bgClass: string; iconClass: string }> = {
  'Key Observation': { 
    icon: Lightbulb, 
    borderClass: 'border-blue-100', 
    bgClass: 'bg-blue-50/50', 
    iconClass: 'text-blue-600 bg-blue-100/60' 
  },
  'Risk Area': { 
    icon: AlertTriangle, 
    borderClass: 'border-rose-100', 
    bgClass: 'bg-rose-50/50', 
    iconClass: 'text-rose-600 bg-rose-100/60' 
  },
  'Growth Opportunity': { 
    icon: TrendingUp, 
    borderClass: 'border-emerald-100', 
    bgClass: 'bg-emerald-50/50', 
    iconClass: 'text-emerald-600 bg-emerald-100/60' 
  },
  'Suggested Action': { 
    icon: CheckSquare, 
    borderClass: 'border-amber-100', 
    bgClass: 'bg-amber-50/50', 
    iconClass: 'text-amber-600 bg-amber-100/60' 
  },
  'Conclusion': { 
    icon: Sparkles, 
    borderClass: 'border-purple-100', 
    bgClass: 'bg-purple-50/50', 
    iconClass: 'text-purple-600 bg-purple-100/60' 
  },
  'AI Recommendation': { 
    icon: Bot, 
    borderClass: 'border-slate-100', 
    bgClass: 'bg-slate-50/50', 
    iconClass: 'text-slate-600 bg-slate-100/60' 
  }
};

const parseInsight = (text: string): InsightSection[] => {
  const sections: InsightSection[] = [];
  const lines = text.split('\n');
  let currentSection: InsightSection | null = null;

  const sectionHeaders = [
    { key: 'Key Observation', pattern: /^\s*(1\.\s*)?Key\s+Observation/i },
    { key: 'Risk Area', pattern: /^\s*(2\.\s*)?Risk\s+Area/i },
    { key: 'Growth Opportunity', pattern: /^\s*(3\.\s*)?Growth\s+Opportunity/i },
    { key: 'Suggested Action', pattern: /^\s*(4\.\s*)?Suggested\s+Action/i },
    { key: 'Conclusion', pattern: /^\s*(5\.\s*)?Conclusion/i }
  ];

  for (const line of lines) {
    const matchedHeader = sectionHeaders.find(h => h.pattern.test(line));
    if (matchedHeader) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = { title: matchedHeader.key, content: '' };
    } else if (currentSection) {
      currentSection.content += line + '\n';
    } else {
      if (line.trim()) {
        currentSection = { title: 'AI Recommendation', content: line + '\n' };
      }
    }
  }

  if (currentSection) {
    sections.push(currentSection);
  }

  return sections.map(s => ({
    title: s.title,
    content: s.content.trim().replace(/^[:\-\s\d\.]+/g, '') // strip leading bullet punctuation/spaces
  })).filter(s => s.content.length > 0);
};

export const AIInsightBox: React.FC<AIInsightBoxProps> = ({ dashboardData }) => {
  const [loading, setLoading] = useState(false);
  const [insight, setInsight] = useState<AIInsightResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUnavailable, setIsUnavailable] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('hide_ai_advisor') === 'true';
    }
    return false;
  });
  const [question, setQuestion] = useState('Analyze this MSME dashboard and give important insights.');

  if (isUnavailable) return null;

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await dashboardAiApi.generateMsmeInsight(question, dashboardData);
      if (result.success) {
        if (result.fallback) {
          console.warn('AI Advisor live providers unavailable, hiding block.');
          setIsUnavailable(true);
          return;
        }
        setInsight(result);
      } else {
        if (result.code === 'AUTH_TOKEN_MISSING' || result.code === 'AUTH_TOKEN_INVALID' || result.code === 'SESSION_INVALID') {
          setIsUnavailable(true);
          return;
        }
        // Gracefully hide the AI block if it fails or is not working
        console.warn('AI Advisor is not working, hiding block. Error:', result.error);
        setIsUnavailable(true);
      }
    } catch (err: any) {
      console.warn('AI Advisor exception, hiding block. Error:', err);
      setIsUnavailable(true);
    } finally {
      setLoading(false);
    }
  };

  const parsedSections = insight?.answer ? parseInsight(insight.answer) : [];

  return (
    <Card className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden animate-in fade-in duration-300">
      <CardHeader className="bg-gradient-to-r from-slate-50 to-blue-50/30 border-b border-slate-200 px-4 py-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-[#12335f] text-white flex items-center justify-center shadow-sm">
              <Bot className="h-4 w-4 animate-bounce" />
            </div>
            <div>
              <CardTitle className="text-xs font-black uppercase text-slate-900 tracking-wide">
                AI MSME Business Advisor
              </CardTitle>
              <p className="text-[10px] text-slate-500 font-semibold leading-none mt-0.5">
                On-Demand Portal Insights & Analytics
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {insight && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#12335f]/5 border border-[#12335f]/10 text-[9px] font-bold text-[#12335f] uppercase tracking-wider">
                <Cpu className="h-3 w-3 shrink-0" />
                <span>{insight.fallback ? 'Portal fallback' : 'Engine: Active'}</span>
              </div>
            )}
            <button
              onClick={() => {
                setIsUnavailable(true);
                localStorage.setItem('hide_ai_advisor', 'true');
              }}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100/80 transition-colors"
              title="Hide AI Advisor"
              type="button"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        <div className="space-y-2">
          <label className="text-[9.5px] font-black uppercase tracking-wider text-slate-400 block pl-0.5">
            What would you like the advisor to analyze?
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. What are the key risk areas based on these metrics?"
              className="flex-1 h-9 px-3 rounded-md border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#12335f]/20 focus:border-[#12335f] transition-all"
              disabled={loading}
            />
            <Button
              onClick={handleGenerate}
              disabled={loading || !question.trim()}
              className="h-9 px-4 rounded-md bg-[#12335f] hover:bg-[#0b2445] text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-sm"
            >
              {loading ? (
                <>
                  <RotateCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Generate AI Insight</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-100 bg-red-50/50 p-3.5 flex items-start gap-2.5 text-xs text-red-700 animate-shake">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-extrabold uppercase text-[10px] tracking-wider">Analysis Failed</p>
              <p className="font-semibold text-red-600/90 leading-relaxed">{error}</p>
            </div>
          </div>
        )}

        {parsedSections.length > 0 && (
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1 pl-0.5">
              <Sparkles className="h-3.5 w-3.5 text-[#c8a45c]" />
              Analysis Results
            </h4>
            
            <div className="grid gap-3 sm:grid-cols-2">
              {parsedSections.map((section, index) => {
                const meta = SECTION_METADATA[section.title] || SECTION_METADATA['AI Recommendation'];
                const SectionIcon = meta.icon;
                const isConclusion = section.title === 'Conclusion';
                
                return (
                  <div 
                    key={section.title}
                    className={cn(
                      "rounded-lg border p-3.5 transition hover:shadow-md/5",
                      meta.borderClass,
                      meta.bgClass,
                      isConclusion && "sm:col-span-2 bg-gradient-to-br from-purple-50/50 via-white to-blue-50/30"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className={cn("h-7 w-7 rounded-md flex items-center justify-center", meta.iconClass)}>
                        <SectionIcon className="h-4 w-4" />
                      </div>
                      <h5 className="text-[11px] font-black uppercase tracking-wide text-slate-900">
                        {section.title}
                      </h5>
                    </div>
                    <p className="text-xs font-semibold text-slate-650 leading-relaxed whitespace-pre-line pl-0.5">
                      {section.content}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
