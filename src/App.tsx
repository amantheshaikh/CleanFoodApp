import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { IngredientAnalyzer } from './components/IngredientAnalyzer';
import { CleanEatingGuide } from './components/CleanEatingGuide';
import { AuthModal } from './components/AuthModal';
import { AnalysisHistory } from './components/AnalysisHistory';
import { UserPreferences } from './components/UserPreferences';
import { FeedbackForm } from './components/FeedbackForm';
import { ApiDocs } from './components/ApiDocs';
import { Card, CardContent } from './components/ui/card';
import { Button } from './components/ui/button';
import { ImageWithFallback } from './components/figma/ImageWithFallback';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from './components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './components/ui/dialog';
import { Leaf, BookOpen, Search, User, LogOut, History, Settings, MessageSquare, Menu, FileCode } from 'lucide-react';
import { supabase } from './utils/supabase/client';
import type { AvoidSectionId } from './data/avoidList';
import { Toaster } from './components/ui/sonner';
import { Logo } from './components/Logo';

type GuideFocusTarget = {
  section: AvoidSectionId;
  slug: string;
  name: string;
};

const HERO_IMAGE_SRC = '/images/hero-clean-plate.jpg';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [activeTab, setActiveTab] = useState('analyzer');
  const [guideFocus, setGuideFocus] = useState<GuideFocusTarget | null>(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const mainContentRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);

  const focusMainContent = () => {
    if (typeof window === 'undefined') return;
    const target = mainContentRef.current;
    if (!target) return;

    const doScroll = () => {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    window.requestAnimationFrame(doScroll);
  };

  const handleHomeClick = () => {
    setGuideFocus(null);
    setActiveTab('analyzer');
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (session?.access_token) {
          setUser(session.user);
          setAccessToken(session.access_token);
        }
      })
      .catch((error) => console.error('Session check failed', error));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (session?.access_token) {
        setUser(session.user);
        setAccessToken(session.access_token);
      } else {
        setUser(null);
        setAccessToken(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    const updateHeaderHeight = () => {
      const height = headerRef.current?.offsetHeight ?? 0;
      document.documentElement.style.setProperty('--app-header-height', `${height}px`);
    };

    updateHeaderHeight();
    window.addEventListener('resize', updateHeaderHeight);

    return () => {
      window.removeEventListener('resize', updateHeaderHeight);
    };
  }, []);

  const handleAuthSuccess = (newUser: any, token: string) => {
    setUser(newUser);
    setAccessToken(token);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setAccessToken(null);
    setActiveTab('analyzer');
    setGuideFocus(null);
  };

  const handleNavigateToGuide = (payload: GuideFocusTarget) => {
    setGuideFocus(payload);
    setActiveTab('guide');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header
        ref={headerRef}
        className="fixed left-0 right-0 top-0 z-50 w-full border-b bg-card shadow-md"
      >
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Logo onClick={handleHomeClick} />

          <nav className="hidden items-center gap-2 md:flex">
            <Button
              variant={activeTab === 'analyzer' ? 'secondary' : 'ghost'}
              onClick={() => {
                setGuideFocus(null);
                setActiveTab('analyzer');
                focusMainContent();
              }}
            >
              <Search className="h-4 w-4" />
              Analyze
            </Button>
            <Button
              variant={activeTab === 'guide' ? 'secondary' : 'ghost'}
              onClick={() => {
                setGuideFocus(null);
                setActiveTab('guide');
                focusMainContent();
              }}
            >
              <BookOpen className="h-4 w-4" />
              Guide
            </Button>
            <Button
              variant={activeTab === 'api-docs' ? 'secondary' : 'ghost'}
              onClick={() => {
                setGuideFocus(null);
                setActiveTab('api-docs');
                focusMainContent();
              }}
            >
              <FileCode className="h-4 w-4" />
              API Docs
            </Button>
            {user && (
              <>
                <Button
                  variant={activeTab === 'history' ? 'secondary' : 'ghost'}
                  onClick={() => {
                    setActiveTab('history');
                    focusMainContent();
                  }}
                >
                  <History className="h-4 w-4" />
                  History
                </Button>
                <Button
                  variant={activeTab === 'preferences' ? 'secondary' : 'ghost'}
                  onClick={() => {
                    setActiveTab('preferences');
                    focusMainContent();
                  }}
                >
                  <Settings className="h-4 w-4" />
                  Preferences
                </Button>
              </>
            )}
            <Button variant="ghost" onClick={() => setShowFeedbackModal(true)}>
              <MessageSquare className="h-4 w-4" />
              Feedback
            </Button>
          </nav>

          <div className="flex items-center gap-3">
            {user ? (
              <span className="hidden text-sm text-muted-foreground sm:inline">
                Welcome, {user.user_metadata?.name || user.email}
              </span>
            ) : (
              <Button variant="default" onClick={() => setShowAuthModal(true)}>
                <User className="h-4 w-4" />
                Sign In
              </Button>
            )}

            {user && (
              <Button variant="ghost" onClick={handleSignOut}>
                <LogOut className="h-4 w-4" />
                Sign Out
              </Button>
            )}

            <DropdownMenu open={isAccountMenuOpen} onOpenChange={setIsAccountMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="md:hidden">
                  <Menu className="h-4 w-4" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem
                  onSelect={() => {
                    setIsAccountMenuOpen(false);
                    setGuideFocus(null);
                    setActiveTab('analyzer');
                    setTimeout(() => focusMainContent(), 150);
                  }}
                  className="flex items-center gap-2"
                >
                  <Search className="h-4 w-4" />
                  Analyze Food
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    setIsAccountMenuOpen(false);
                    setGuideFocus(null);
                    setActiveTab('guide');
                    setTimeout(() => focusMainContent(), 150);
                  }}
                  className="flex items-center gap-2"
                >
                  <BookOpen className="h-4 w-4" />
                  Clean Eating Guide
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    setIsAccountMenuOpen(false);
                    setGuideFocus(null);
                    setActiveTab('api-docs');
                    setTimeout(() => focusMainContent(), 150);
                  }}
                  className="flex items-center gap-2"
                >
                  <FileCode className="h-4 w-4" />
                  API Docs
                </DropdownMenuItem>
                {user && (
                  <>
                    <DropdownMenuItem
                      onSelect={() => {
                        setActiveTab('history');
                        setIsAccountMenuOpen(false);
                        setTimeout(() => focusMainContent(), 150);
                      }}
                      className="flex items-center gap-2"
                    >
                      <History className="h-4 w-4" />
                      History
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        setActiveTab('preferences');
                        setIsAccountMenuOpen(false);
                        setTimeout(() => focusMainContent(), 150);
                      }}
                      className="flex items-center gap-2"
                    >
                      <Settings className="h-4 w-4" />
                      Preferences
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuItem
                  onSelect={() => {
                    setIsAccountMenuOpen(false);
                    setTimeout(() => setShowFeedbackModal(true), 100);
                  }}
                  className="flex items-center gap-2"
                >
                  <MessageSquare className="h-4 w-4" />
                  Provide Feedback
                </DropdownMenuItem>
                {user && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => {
                        setIsAccountMenuOpen(false);
                        setTimeout(() => handleSignOut(), 0);
                      }}
                      className="flex items-center gap-2 text-red-600"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign Out
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div style={{ paddingTop: 'var(--app-header-height)' }}>
        {/* Hero Section */}
        <section className="container mx-auto px-4 py-6">
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="grid md:grid-cols-2 gap-0 md:min-h-[480px]">
                <div className="p-6 flex flex-col justify-center md:min-h-[480px]">
                  <h2 className="text-3xl mb-4">
                    Analyze any food product instantly
                  </h2>
                  <p className="text-muted-foreground mb-6 leading-relaxed">
                    CleanEats analyzes ingredients for harmful additives, allergens, 
                    and dietary restrictions — offering instant, science-based insights 
                    tailored to your body and lifestyle.
                  </p>
                  <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center">
                    <div className="flex items-center gap-2">
                      <Search className="h-4 w-4" />
                      <span>Instant Analysis</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Leaf className="h-4 w-4" />
                      <span>Clean Standards</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      <span>Personalized Recommendations</span>
                    </div>
                  </div>
                </div>
                <div className="relative h-48 md:h-[480px] flex items-center justify-center bg-muted/40">
                  <ImageWithFallback
                    src={HERO_IMAGE_SRC}
                    alt="Fresh organic ingredients bowl"
                    className="h-full w-full max-w-[420px] object-contain"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Main Content */}
        <main
          ref={mainContentRef}
          className="container mx-auto px-4 pb-12 scroll-mt-24 focus:outline-none"
          tabIndex={-1}
        >
          {activeTab === 'analyzer' && (
            <IngredientAnalyzer accessToken={accessToken} onNavigateToGuide={handleNavigateToGuide} />
          )}
          {activeTab === 'guide' && (
            <CleanEatingGuide focusedIngredient={guideFocus} onClearFocus={() => setGuideFocus(null)} />
          )}
          {user && activeTab === 'history' && (
            <AnalysisHistory accessToken={accessToken} />
          )}
          {user && activeTab === 'preferences' && (
            <UserPreferences accessToken={accessToken} />
          )}
          {activeTab === 'api-docs' && <ApiDocs />}
        </main>

        {/* Footer */}
        <footer className="border-t bg-muted/30 mt-12">
          <div className="container mx-auto px-4 py-6">
            <div className="flex flex-col items-center gap-3 text-center text-muted-foreground sm:flex-row sm:justify-between sm:text-left">
              <div>
                <p>CleanEats - Your guide to cleaner eating choices</p>
                <p className="text-sm mt-1">
                  Analysis based on common clean eating standards. Always consult nutritional professionals for dietary advice.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-end">
                <Button
                  variant="link"
                  className="px-0 text-sm"
                  onClick={() => setShowTermsModal(true)}
                >
                  Terms of Use
                </Button>
                <Button
                  variant="link"
                  className="px-0 text-sm"
                  onClick={() => setShowPrivacyModal(true)}
                >
                  Privacy Policy
                </Button>
              </div>
            </div>
          </div>
        </footer>
      </div>

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={handleAuthSuccess}
      />

      <Dialog open={showFeedbackModal} onOpenChange={setShowFeedbackModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Share your feedback</DialogTitle>
            <DialogDescription>
              Let us know how CleanEats is working for you and what we should improve next.
            </DialogDescription>
          </DialogHeader>
          <FeedbackForm accessToken={accessToken} variant="plain" />
        </DialogContent>
      </Dialog>

      <Dialog open={showTermsModal} onOpenChange={setShowTermsModal}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Terms of Use</DialogTitle>
            <DialogDescription>
              Please review these guidelines before using CleanEats.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>
              CleanEats helps you evaluate ingredients based on widely accepted clean-eating principles. By using the
              app, you agree to use the information for personal guidance only and to make your own purchasing and
              dietary decisions.
            </p>
            <p>
              We do not provide medical advice or warranty the accuracy of third-party data sources. Always consult
              qualified professionals if you have specific health concerns.
            </p>
            <p>
              Continued use of CleanEats signifies your acceptance of these terms. If you do not agree, please discontinue
              use of the app.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showPrivacyModal} onOpenChange={setShowPrivacyModal}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Privacy Policy</DialogTitle>
            <DialogDescription>
              Learn how we collect, use, and protect your data.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>
              CleanEats stores only the information needed to deliver ingredient analysis, save your preferences, and
              improve the experience. Ingredient scans and feedback you submit may be reviewed to enhance accuracy.
            </p>
            <p>
              We do not sell your personal data. Access is restricted to trusted service providers that help us operate
              the application, and only for the purposes described here.
            </p>
            <p>
              You may request deletion of your account and associated data at any time by contacting support through the
              feedback form.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <Toaster richColors position="top-right" closeButton />
    </div>
  );
}
