'use client';

import { useState } from 'react';
import {
  Shield,
  Activity,
  Brain,
  Database,
  Bell,
  Menu,
  X,
  Zap,
  GraduationCap,
  Bot,
} from 'lucide-react';

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface NavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export default function Navigation({ activeTab, onTabChange }: NavigationProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <Activity className="w-4 h-4" /> },
    { id: 'detection', label: 'Detections', icon: <Shield className="w-4 h-4" /> },
    { id: 'models', label: 'ML Models', icon: <Brain className="w-4 h-4" /> },
    { id: 'auto-response', label: 'Auto-Response', icon: <Zap className="w-4 h-4" /> },
    { id: 'training', label: 'Training', icon: <GraduationCap className="w-4 h-4" /> },
    { id: 'datasets', label: 'Datasets', icon: <Database className="w-4 h-4" /> },
    { id: 'alerts', label: 'Alerts', icon: <Bell className="w-4 h-4" /> },
    { id: 'assistant', label: 'AI Assistant', icon: <Bot className="w-4 h-4" /> },
  ];

  return (
    <nav className="border-b border-zinc-800 bg-zinc-950/95 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
              <Shield className="w-4 h-4 text-cyan-400" />
            </div>
            <span className="text-base font-semibold text-white tracking-wide">AI-IDS</span>
          </div>

          <div className="hidden md:flex items-center gap-1 overflow-x-auto">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors whitespace-nowrap ${
                  activeTab === item.id
                    ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50 border border-transparent'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-2">
            <span className="status-dot active" />
            <span className="text-xs text-zinc-500">System Active</span>
          </div>

          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 text-zinc-400 hover:text-white"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-zinc-800 bg-zinc-950">
          <div className="px-4 py-2 space-y-1">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => {
                  onTabChange(item.id);
                  setIsMobileMenuOpen(false);
                }}
                className={`flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm transition-colors ${
                  activeTab === item.id
                    ? 'bg-cyan-500/10 text-cyan-300'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}
