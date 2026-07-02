import type { Metadata } from 'next';
import RankForm from '@/components/ui/RankForm';

export const metadata: Metadata = {
  title: 'Recruit Pipeline — AI Resume Ranker',
  description: 'Upload PDF resumes and rank them against any job description using AI.',
};

export default function Page() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 py-16 px-4">
      {/* Hero Header */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/30 rounded-full px-4 py-1.5 text-indigo-300 text-xs font-semibold tracking-widest uppercase mb-4">
          <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
          AI-Powered Recruiting
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-3 tracking-tight">
          Hiresense <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">AI</span> Engine
        </h1>
        <p className="text-white/50 text-base max-w-md mx-auto">
          Upload PDF resumes, paste a job description, and let AI score and rank every candidate instantly.
        </p>
      </div>

      {/* Form */}
      <RankForm />
    </main>
  );
}
