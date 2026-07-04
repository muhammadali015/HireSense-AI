import type { Metadata } from 'next';
import RankForm from '@/components/ui/RankForm';

export const metadata: Metadata = {
  title: 'Hiresense Ai',
  description: 'Upload PDF resumes and rank them against any job description using AI.',
};

export default function Page() {
  return (
    <main className="min-h-screen">
      <div className="hud-page space-y-10">
        <section className="hud-panel border-cyan-500/20 p-8">
          <div className="max-w-3xl space-y-6">
            <div className="inline-flex items-center gap-2 bg-cyan-500/10 border border-cyan-500/20 rounded-full px-4 py-1.5 text-cyan-300 text-xs font-semibold tracking-widest uppercase">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              Mission Control Dashboard
            </div>
            <div className="space-y-4">
              <h1 className="text-4xl md:text-5xl font-extrabold hud-heading tracking-tight">
                Hiresense <span className="text-cyan-300">AI</span> Engine
              </h1>
              <p className="text-sm hud-subtle max-w-2xl leading-7">
                Upload PDF resumes, paste a job description, and let AI score and rank every candidate instantly with a mission-control view for recruiters.
              </p>
            </div>
          </div>
        </section>

        <section className="hud-panel p-8">
          <RankForm />
        </section>
      </div>
    </main>
  );
}
