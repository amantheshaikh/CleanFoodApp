import { useState, useEffect, useRef } from 'react';
import { IngredientAnalyzer } from './components/IngredientAnalyzer';
import { CleanEatingGuide } from './components/CleanEatingGuide';
import { AuthModal } from './components/AuthModal';
import { AnalysisHistory } from './components/AnalysisHistory';
import { UserPreferences } from './components/UserPreferences';
import { FeedbackForm } from './components/FeedbackForm';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Card, CardContent } from './components/ui/card';
import { Button } from './components/ui/button';
import { ImageWithFallback } from './components/figma/ImageWithFallback';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from './components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './components/ui/dialog';
import { Leaf, BookOpen, Search, User, LogOut, History, Settings, MessageSquare } from 'lucide-react';
import { supabase } from './utils/supabase/client';
import type { AvoidSectionId } from './data/avoidList';

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
  const mainContentRef = useRef<HTMLDivElement | null>(null);

  const focusMainContent = () => {
    if (typeof window === 'undefined') return;
    const target = mainContentRef.current;
    if (!target) return;

    const doScroll = () => {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    window.requestAnimationFrame(doScroll);
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
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-green-100 rounded-full flex items-center justify-center">
                <Leaf className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-foreground">CleanEats</h1>
                <p className="text-muted-foreground">Know what you eat</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {user ? (
                <>
                  <span className="text-sm text-muted-foreground">
                    Welcome, {user.user_metadata?.name || user.email}
                  </span>
                  <DropdownMenu open={isAccountMenuOpen} onOpenChange={setIsAccountMenuOpen}>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" className="rounded-full">
                        <User className="h-4 w-4" />
                        <span className="sr-only">Account menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
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
                          setIsAccountMenuOpen(false);
                          setTimeout(() => setShowFeedbackModal(true), 100);
                        }}
                        className="flex items-center gap-2"
                      >
                        <MessageSquare className="h-4 w-4" />
                        Provide Feedback
                      </DropdownMenuItem>
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
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowFeedbackModal(true)}
                    className="flex items-center gap-2"
                  >
                    <MessageSquare className="h-4 w-4" />
                    Feedback
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => setShowAuthModal(true)}
                  >
                    <User className="h-4 w-4 mr-2" />
                    Sign In
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

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
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
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
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full mb-8 grid-cols-2 h-12">
            <TabsTrigger
              value="analyzer"
              className="flex items-center gap-3 px-4 py-2 text-base"
            >
              <Search className="h-4 w-4" />
              Analyze Food
            </TabsTrigger>
            <TabsTrigger
              value="guide"
              className="flex items-center gap-3 px-4 py-2 text-base"
            >
              <BookOpen className="h-4 w-4" />
              Clean Eating Guide
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="analyzer">
            <IngredientAnalyzer accessToken={accessToken} onNavigateToGuide={handleNavigateToGuide} />
          </TabsContent>
          
              <TabsContent value="guide">
                <CleanEatingGuide focusedIngredient={guideFocus} onClearFocus={() => setGuideFocus(null)} />
              </TabsContent>
            
          {user && activeTab === 'history' && (
            <TabsContent value="history">
              <AnalysisHistory accessToken={accessToken} />
            </TabsContent>
          )}

          {user && activeTab === 'preferences' && (
            <TabsContent value="preferences">
              <UserPreferences accessToken={accessToken} />
            </TabsContent>
          )}
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t bg-muted/30 mt-12">
        <div className="container mx-auto px-4 py-6">
          <div className="text-center text-muted-foreground">
            <p>CleanEats - Your guide to cleaner eating choices</p>
            <p className="text-sm mt-1">
              Analysis based on common clean eating standards. Always consult nutritional professionals for dietary advice.
            </p>
          </div>
        </div>
      </footer>

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
    </div>
  );
}
