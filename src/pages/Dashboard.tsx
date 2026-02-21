import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BrainCircuit, FileText, Mic, History, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const { user, signOut } = useAuth();

  if (!user) return <Navigate to="/auth" replace />;

  const cards = [
    {
      icon: FileText,
      title: 'Resume Analysis',
      description: 'Upload your resume and get AI-powered scoring with improvement tips',
      href: '/resume',
      gradient: 'from-primary to-accent',
    },
    {
      icon: Mic,
      title: 'Voice Interview',
      description: 'Practice with AI voice interviews based on your resume',
      href: '/resume',
      gradient: 'from-accent to-destructive',
      note: 'Upload resume first',
    },
    {
      icon: History,
      title: 'Interview History',
      description: 'Review past interview sessions and track your progress',
      href: '/history',
      gradient: 'from-success to-primary',
    },
  ];

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-accent/5 rounded-full blur-3xl" />

      {/* Header */}
      <header className="relative z-10 border-b border-border/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg gradient-bg flex items-center justify-center">
              <BrainCircuit className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-display font-bold">ResumeAI</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:block">{user.email}</span>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="w-4 h-4 mr-2" /> Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 container mx-auto px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-3xl md:text-4xl font-display font-bold mb-2">
            Welcome back, <span className="gradient-text">{user.user_metadata?.full_name || 'there'}</span>
          </h1>
          <p className="text-muted-foreground mb-10">Ready to level up your interview game?</p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6">
          {cards.map((card, i) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.1 }}
            >
              <Link to={card.href} className="block">
                <div className="glass-card-hover p-6 h-full">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${card.gradient} flex items-center justify-center mb-4`}>
                    <card.icon className="w-6 h-6 text-foreground" />
                  </div>
                  <h3 className="text-lg font-display font-semibold mb-2">{card.title}</h3>
                  <p className="text-sm text-muted-foreground">{card.description}</p>
                  {card.note && (
                    <span className="inline-block mt-3 text-xs px-2 py-1 rounded bg-secondary text-muted-foreground">
                      {card.note}
                    </span>
                  )}
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </main>
    </div>
  );
}
