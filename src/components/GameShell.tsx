import React, { useState } from 'react';
import { ArrowLeft, HelpCircle, RotateCcw, X } from 'lucide-react';
import { useGameStation } from '../context/GameStationContext';

interface GameShellProps {
  title: string;
  subtitle: string;
  rules: string[];
  onBack: () => void;
  onRestart?: () => void;
  controls?: React.ReactNode;
  children: React.ReactNode;
}

export const GameShell: React.FC<GameShellProps> = ({
  title,
  subtitle,
  rules,
  onBack,
  onRestart,
  controls,
  children,
}) => {
  const { sfx } = useGameStation();
  const [showRules, setShowRules] = useState(false);

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800/80 bg-slate-900/75 backdrop-blur-md px-4 py-3 shadow-lg">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => {
              sfx('click');
              onBack();
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700/80 bg-slate-800/80 px-3 py-1.5 text-xs sm:text-sm font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Lobi
          </button>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-extrabold text-white truncate">{title}</h1>
            <p className="text-xs text-slate-400 truncate">{subtitle}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {controls}
          <button
            type="button"
            onClick={() => {
              sfx('click');
              setShowRules(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700/80 bg-slate-800/80 px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-200 hover:bg-slate-700 transition cursor-pointer"
          >
            <HelpCircle className="w-4 h-4 text-sky-400" />
            Cara Main
          </button>
          {onRestart && (
            <button
              type="button"
              onClick={() => {
                sfx('click');
                onRestart();
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-500/40 bg-indigo-500/15 px-3 py-1.5 text-xs sm:text-sm font-semibold text-indigo-200 hover:bg-indigo-500/25 transition cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Ulang
            </button>
          )}
        </div>
      </div>

      <div>{children}</div>

      {showRules && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setShowRules(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl animate-pop-in space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Cara Main — {title}</h2>
              <button
                type="button"
                onClick={() => setShowRules(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <ul className="space-y-2.5 text-sm text-slate-300 list-disc pl-5">
              {rules.map((rule, idx) => (
                <li key={idx} className="leading-relaxed">
                  {rule}
                </li>
              ))}
            </ul>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowRules(false)}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition cursor-pointer"
              >
                Siap Main!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
