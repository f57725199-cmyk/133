
import React, { useState, useEffect } from 'react';
import { User, Subject, StudentTab, SystemSettings, CreditPackage, WeeklyTest, Chapter } from '../types';
import { updateUserStatus, db, saveUserToLive, getChapterData } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { getSubjectsList } from '../constants';
import { RedeemSection } from './RedeemSection';
import { Store } from './Store';
import { Zap, Crown, Calendar, Clock, History, Layout, Gift, Sparkles, Megaphone, Lock, BookOpen, AlertCircle, Edit, Settings, Play, Pause, RotateCcw, MessageCircle, Gamepad2, Timer, CreditCard, Send, CheckCircle, Mail, X, Ban, Smartphone, Trophy, ShoppingBag, ArrowRight, Video, Youtube, Home, User as UserIcon, Book } from 'lucide-react';
import { SubjectSelection } from './SubjectSelection';
import { ChapterSelection } from './ChapterSelection'; // Imported for Video Flow
import { VideoPlaylistView } from './VideoPlaylistView'; // Imported for Video Flow
import { PdfView } from './PdfView'; // Imported for PDF Flow
import { McqView } from './McqView'; // Imported for MCQ Flow
import { HistoryPage } from './HistoryPage';
import { UniversalChat } from './UniversalChat';
import { Leaderboard } from './Leaderboard';
import { SpinWheel } from './SpinWheel';
import { fetchChapters } from '../services/gemini'; // Needed for Video Flow
import { FileText, CheckSquare } from 'lucide-react'; // Icons
import { LoadingOverlay } from './LoadingOverlay';
import { CreditConfirmationModal } from './CreditConfirmationModal';
import { UserGuide } from './UserGuide';
import { SyllabusStructure } from './SyllabusStructure';

interface Props {
  user: User;
  dailyStudySeconds: number; // Received from Global App
  onSubjectSelect: (subject: Subject) => void;
  onRedeemSuccess: (user: User) => void;
  settings?: SystemSettings; // New prop
  onStartWeeklyTest?: (test: WeeklyTest) => void;
  activeTab: StudentTab;
  onTabChange: (tab: StudentTab) => void;
  setFullScreen: (full: boolean) => void; // Passed from App
  onNavigate?: (view: 'ADMIN_DASHBOARD') => void; // Added for Admin Switch
}

const DEFAULT_PACKAGES: CreditPackage[] = [
    { id: 'pkg-1', name: 'Starter Pack', price: 100, credits: 150 },
    { id: 'pkg-2', name: 'Value Pack', price: 200, credits: 350 },
    { id: 'pkg-3', name: 'Pro Pack', price: 500, credits: 1500 },
    { id: 'pkg-4', name: 'Ultra Pack', price: 1000, credits: 3000 },
    { id: 'pkg-5', name: 'Mega Pack', price: 2000, credits: 7000 },
    { id: 'pkg-6', name: 'Giga Pack', price: 3000, credits: 12000 },
    { id: 'pkg-7', name: 'Ultimate Pack', price: 5000, credits: 20000 }
];

export const StudentDashboard: React.FC<Props> = ({ user, dailyStudySeconds, onSubjectSelect, onRedeemSuccess, settings, onStartWeeklyTest, activeTab, onTabChange, setFullScreen, onNavigate }) => {
  // const [activeTab, setActiveTab] = useState<StudentTab>('VIDEO'); // REMOVED LOCAL STATE
  const [testAttempts, setTestAttempts] = useState<Record<string, any>>(JSON.parse(localStorage.getItem(`nst_test_attempts_${user.id}`) || '{}'));
  const globalMessage = localStorage.getItem('nst_global_message');
  const [activeExternalApp, setActiveExternalApp] = useState<string | null>(null);
  const [pendingApp, setPendingApp] = useState<{app: any, cost: number} | null>(null);
  const [seasonContentSelection, setSeasonContentSelection] = useState<{chapter: Chapter, subject: Subject} | null>(null);

  // GENERIC CONTENT FLOW STATE (Used for Video, PDF, MCQ)
  const [contentViewStep, setContentViewStep] = useState<'SUBJECTS' | 'CHAPTERS' | 'PLAYER'>('SUBJECTS');
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loadingChapters, setLoadingChapters] = useState(false);
  
  // LOADING STATE FOR 10S RULE
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [isDataReady, setIsDataReady] = useState(false);

  const [editMode, setEditMode] = useState(false);
  const [profileData, setProfileData] = useState({
      classLevel: user.classLevel || '10',
      board: user.board || 'CBSE',
      stream: user.stream || 'Science',
      newPassword: '',
      dailyGoalHours: 3 // Default
  });

  const [canClaimReward, setCanClaimReward] = useState(false);
  const [selectedPhoneId, setSelectedPhoneId] = useState<string>('');
  const [showUserGuide, setShowUserGuide] = useState(false);
  const [showFeaturesModal, setShowFeaturesModal] = useState(false); // NEW
  
  // Custom Daily Target Logic
  const [dailyTargetSeconds, setDailyTargetSeconds] = useState(3 * 3600);
  const REWARD_AMOUNT = settings?.dailyReward || 3;
  
  // Phone setup
  const adminPhones = settings?.adminPhones || [{id: 'default', number: '8227070298', name: 'Admin'}];
  const defaultPhoneId = adminPhones.find(p => p.isDefault)?.id || adminPhones[0]?.id || 'default';
  
  if (!selectedPhoneId && adminPhones.length > 0) {
    setSelectedPhoneId(defaultPhoneId);
  }

  // --- HERO SLIDER STATE ---
  const [currentSlide, setCurrentSlide] = useState(0);
  const slides = [
      { id: 1, title: "Ultra Subscription", subtitle: "Unlimited Access to Videos & PDFs", color: "from-purple-600 to-blue-600" },
      { id: 2, title: "Ace Your Exams", subtitle: "Practice with 1000+ MCQs", color: "from-orange-500 to-red-600" },
      { id: 3, title: "Live Support", subtitle: "Chat directly with experts", color: "from-emerald-500 to-teal-600" }
  ];

  useEffect(() => {
      const timer = setInterval(() => {
          setCurrentSlide((prev) => (prev + 1) % slides.length);
      }, 4000);
      return () => clearInterval(timer);
  }, []);

  // --- ADMIN SWITCH HANDLER ---
  const handleSwitchToAdmin = () => {
    if (onNavigate) {
       onNavigate('ADMIN_DASHBOARD');
    }
  };
  
  const getPhoneNumber = (phoneId?: string) => {
    const phone = adminPhones.find(p => p.id === (phoneId || selectedPhoneId));
    return phone ? phone.number : '8227070298';
  };

  useEffect(() => {
      // Load user's custom goal
      const storedGoal = localStorage.getItem(`nst_goal_${user.id}`);
      if (storedGoal) {
          const hours = parseInt(storedGoal);
          setDailyTargetSeconds(hours * 3600);
          setProfileData(prev => ({...prev, dailyGoalHours: hours}));
      }
  }, [user.id]);

  // ... (Existing Reward Logic - Keep as is) ...
  // --- CHECK YESTERDAY'S REWARD ON LOAD ---
  useEffect(() => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yDateStr = yesterday.toDateString();
      
      const yActivity = parseInt(localStorage.getItem(`activity_${user.id}_${yDateStr}`) || '0');
      const yClaimed = localStorage.getItem(`reward_claimed_${user.id}_${yDateStr}`);
      
      if (!yClaimed && (!user.subscriptionTier || user.subscriptionTier === 'FREE')) {
          let reward = null;
          if (yActivity >= 10800) reward = { tier: 'MONTHLY', level: 'ULTRA', hours: 4 }; // 3 Hrs -> Ultra
          else if (yActivity >= 3600) reward = { tier: 'WEEKLY', level: 'BASIC', hours: 4 }; // 1 Hr -> Basic

          if (reward) {
              const expiresAt = new Date(new Date().setHours(new Date().getHours() + 24)).toISOString();
              const newMsg = {
                  id: `reward-${Date.now()}`,
                  text: `🎁 Daily Reward! You studied enough yesterday. Claim your ${reward.hours} hours of ${reward.level} access now!`,
                  date: new Date().toISOString(),
                  read: false,
                  type: 'REWARD',
                  reward: { tier: reward.tier as any, level: reward.level as any, durationHours: reward.hours },
                  expiresAt: expiresAt,
                  isClaimed: false
              };
              
              const updatedUser = { 
                  ...user, 
                  inbox: [newMsg, ...(user.inbox || [])] 
              };
              
              handleUserUpdate(updatedUser);
              localStorage.setItem(`reward_claimed_${user.id}_${yDateStr}`, 'true');
          }
      }
  }, [user.id]);

  const claimRewardMessage = (msgId: string, reward: any) => {
      const duration = reward.durationHours || 4;
      const endDate = new Date(Date.now() + duration * 60 * 60 * 1000).toISOString();
      
      const updatedInbox = user.inbox?.map(m => m.id === msgId ? { ...m, isClaimed: true, read: true } : m);
      
      const updatedUser: User = { 
          ...user, 
          subscriptionTier: reward.tier, 
          subscriptionLevel: reward.level,
          subscriptionEndDate: endDate,
          isPremium: true,
          inbox: updatedInbox
      };
      
      handleUserUpdate(updatedUser);
      alert(`✅ Reward Claimed! Enjoy ${duration} hours of ${reward.level} access.`);
  };

  // --- TRACK TODAY'S ACTIVITY & FIRST DAY BONUSES ---
  useEffect(() => {
    if (!user.id) return;
    const unsub = onSnapshot(doc(db, "users", user.id), (doc) => {
        if (doc.exists()) {
            const cloudData = doc.data() as User;
            if (cloudData.credits !== user.credits || 
                cloudData.subscriptionTier !== user.subscriptionTier ||
                cloudData.isPremium !== user.isPremium ||
                cloudData.isGameBanned !== user.isGameBanned) {
                const updated = { ...user, ...cloudData };
                onRedeemSuccess(updated); 
            }
        }
    });
    return () => unsub();
  }, [user.id]); 

  useEffect(() => {
      const interval = setInterval(() => {
          updateUserStatus(user.id, dailyStudySeconds);
          const todayStr = new Date().toDateString();
          localStorage.setItem(`activity_${user.id}_${todayStr}`, dailyStudySeconds.toString());
          
          const accountAgeHours = (Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60);
          const firstDayBonusClaimed = localStorage.getItem(`first_day_ultra_${user.id}`);
          
          if (accountAgeHours < 24 && dailyStudySeconds >= 3600 && !firstDayBonusClaimed) {
              const endDate = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 Hour
              const updatedUser = { 
                  ...user, 
                  subscriptionTier: 'MONTHLY', // Ultra
                  subscriptionEndDate: endDate,
                  isPremium: true
              };
              const storedUsers = JSON.parse(localStorage.getItem('nst_users') || '[]');
              const idx = storedUsers.findIndex((u:User) => u.id === user.id);
              if (idx !== -1) storedUsers[idx] = updatedUser;
              
              localStorage.setItem('nst_users', JSON.stringify(storedUsers));
              localStorage.setItem('nst_current_user', JSON.stringify(updatedUser));
              localStorage.setItem(`first_day_ultra_${user.id}`, 'true');
              
              onRedeemSuccess(updatedUser);
              alert("🎉 FIRST DAY BONUS: You unlocked 1 Hour Free ULTRA Subscription!");
          }
          
      }, 60000); 
      return () => clearInterval(interval);
  }, [dailyStudySeconds, user.id, user.createdAt]);

  // Inbox
  const [showInbox, setShowInbox] = useState(false);
  const unreadCount = user.inbox?.filter(m => !m.read).length || 0;

  useEffect(() => {
    const today = new Date().toDateString();
    const lastClaim = user.lastRewardClaimDate ? new Date(user.lastRewardClaimDate).toDateString() : '';
    setCanClaimReward(lastClaim !== today && dailyStudySeconds >= dailyTargetSeconds);
  }, [user.lastRewardClaimDate, dailyStudySeconds, dailyTargetSeconds]);

  const claimDailyReward = () => {
      if (!canClaimReward) return;
      const updatedUser = {
          ...user,
          credits: (user.credits || 0) + REWARD_AMOUNT,
          lastRewardClaimDate: new Date().toISOString()
      };
      handleUserUpdate(updatedUser);
      setCanClaimReward(false);
      alert(`🎉 Congratulations! You met your Daily Goal.\n\nReceived: ${REWARD_AMOUNT} Free Credits!`);
  };

  const handleExternalAppClick = (app: any) => {
      if (app.isLocked) { alert("This app is currently locked by Admin."); return; }
      if (app.creditCost > 0) {
          if (user.credits < app.creditCost) { alert(`Insufficient Credits! You need ${app.creditCost} credits.`); return; }
          if (user.isAutoDeductEnabled) processAppAccess(app, app.creditCost);
          else setPendingApp({ app, cost: app.creditCost });
          return;
      }
      setActiveExternalApp(app.url);
  };

  const processAppAccess = (app: any, cost: number, enableAuto: boolean = false) => {
      let updatedUser = { ...user, credits: user.credits - cost };
      if (enableAuto) updatedUser.isAutoDeductEnabled = true;
      handleUserUpdate(updatedUser);
      setActiveExternalApp(app.url);
      setPendingApp(null);
  };

  const handleBuyPackage = (pkg: CreditPackage) => {
      const phoneNum = getPhoneNumber();
      const message = `Hello Admin, I want to buy credits.\n\n🆔 User ID: ${user.id}\n📦 Package: ${pkg.name}\n💰 Amount: ₹${pkg.price}\n💎 Credits: ${pkg.credits}\n\nPlease check my payment.`;
      const url = `https://wa.me/91${phoneNum}?text=${encodeURIComponent(message)}`;
      window.open(url, '_blank');
  };

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const saveProfile = () => {
      // Cost Check
      const isPremium = user.isPremium && user.subscriptionEndDate && new Date(user.subscriptionEndDate) > new Date();
      const cost = settings?.profileEditCost ?? 10;
      
      if (!isPremium && user.credits < cost) {
          alert(`Profile update costs ${cost} NST Coins.\nYou have ${user.credits} coins.`);
          return;
      }
      
      if (!isPremium && cost > 0) {
          if (!confirm(`Update Profile for ${cost} NST Coins?`)) return;
      }

      const updatedUser = { 
          ...user, 
          board: profileData.board,
          classLevel: profileData.classLevel,
          stream: profileData.stream,
          password: profileData.newPassword.trim() ? profileData.newPassword : user.password,
          credits: isPremium ? user.credits : user.credits - cost
      };
      localStorage.setItem(`nst_goal_${user.id}`, profileData.dailyGoalHours.toString());
      setDailyTargetSeconds(profileData.dailyGoalHours * 3600);
      handleUserUpdate(updatedUser);
      window.location.reload(); 
      setEditMode(false);
  };
  
  const handleUserUpdate = (updatedUser: User) => {
      const storedUsers = JSON.parse(localStorage.getItem('nst_users') || '[]');
      const userIdx = storedUsers.findIndex((u:User) => u.id === updatedUser.id);
      if (userIdx !== -1) {
          storedUsers[userIdx] = updatedUser;
          localStorage.setItem('nst_users', JSON.stringify(storedUsers));
          localStorage.setItem('nst_current_user', JSON.stringify(updatedUser));
          saveUserToLive(updatedUser); 
          onRedeemSuccess(updatedUser); 
      }
  };

  const markInboxRead = () => {
      if (!user.inbox) return;
      const updatedInbox = user.inbox.map(m => ({ ...m, read: true }));
      handleUserUpdate({ ...user, inbox: updatedInbox });
  };

  // --- GENERIC CONTENT FLOW HANDLERS ---
  const handleContentSubjectSelect = async (subject: Subject) => {
      setSelectedSubject(subject);
      setLoadingChapters(true);
      setContentViewStep('CHAPTERS');
      try {
          const ch = await fetchChapters(user.board || 'CBSE', user.classLevel || '10', user.stream || 'Science', subject, 'English');
          setChapters(ch);
      } catch(e) { console.error(e); }
      setLoadingChapters(false);
  };

  const handleContentChapterSelect = (chapter: Chapter) => {
      setSelectedChapter(chapter);
      setContentViewStep('PLAYER');
      setFullScreen(true); 
  };

  const onLoadingComplete = () => {
      setIsLoadingContent(false);
      setContentViewStep('PLAYER');
      setFullScreen(true);
  };

  // --- SEASON TOPIC CLICK HANDLER ---
  const handleSeasonTopicClick = async (topicName: string, subjectName: string) => {
      // 1. Map Subject Name to Object
      const allSubjects = getSubjectsList(user.classLevel || '10', user.stream || null);
      // Helper map same as in SyllabusStructure
      const subMap: Record<string, string> = {
          'Maths': 'math', 'Mathematics': 'math',
          'Physics': 'physics', 'Chemistry': 'chemistry', 'Biology': 'biology',
          'Science': 'science', 'Social Science': 'sst',
          'History': 'history', 'Geography': 'geography', 'Civics': 'polity', 'Economics': 'economics',
          'English': 'english', 'Hindi': 'hindi'
      };
      
      // Try exact name match first, then map ID
      let targetSubject = allSubjects.find(s => s.name === subjectName);
      if (!targetSubject) {
          const mappedKey = Object.keys(subMap).find(k => subjectName.includes(k));
          if (mappedKey) {
              const mappedId = subMap[mappedKey];
              targetSubject = allSubjects.find(s => s.id === mappedId);
          }
      }

      if (!targetSubject) {
          // If subject not found (e.g. History in 10th Science stream might be hidden if logic says so, but usually 10th has SST)
          // For Class 9/10, SST is one subject, but Syllabus splits it.
          // If subjectName is "History", and we have "Social Science" (sst), we should map History -> sst.
          // My map handles History -> history. But 10th has 'sst'.
          // I should check if 'sst' exists and use it for History/Civics/Geo/Eco if individual subject missing.
          
          if (['History', 'Geography', 'Civics', 'Economics', 'Social Science'].some(k => subjectName.includes(k))) {
              targetSubject = allSubjects.find(s => s.id === 'sst');
          }
      }

      if (!targetSubject) {
          alert(`Subject "${subjectName}" not found in your course list.`);
          return;
      }

      // 2. Fetch Chapters
      setIsLoadingContent(true); 
      
      try {
          const fetchedChapters = await fetchChapters(user.board || 'CBSE', user.classLevel || '10', user.stream || 'Science', targetSubject, 'English');
          
          // 3. Find Matching Chapter (Fuzzy)
          // Clean topic name (remove trailing text like "(start)")
          const cleanTopic = topicName.split('(')[0].trim().toLowerCase();
          
          const matchedChapter = fetchedChapters.find(ch => ch.title.toLowerCase().includes(cleanTopic));
          
          if (matchedChapter) {
              // OPEN SELECTION MODAL
              setIsLoadingContent(false); // Stop loading, we are not navigating yet
              setSeasonContentSelection({ chapter: matchedChapter, subject: targetSubject });
              setChapters(fetchedChapters); // Keep context
          } else {
              // FALLBACK TO CHAPTER LIST
              setIsLoadingContent(false); // Hide overlay immediately as we just show list
              setSelectedSubject(targetSubject);
              setChapters(fetchedChapters);
              setContentViewStep('CHAPTERS');
              onTabChange('COURSES'); // Show list in COURSES tab
          }
          
      } catch (e) {
          console.error(e);
          setIsLoadingContent(false);
          alert("Error loading content. Please check internet.");
      }
  };

  // GENERIC CONTENT SECTION RENDERER
  const renderContentSection = (type: 'VIDEO' | 'PDF' | 'MCQ') => {
      const handlePlayerBack = () => {
          setContentViewStep('CHAPTERS');
          setFullScreen(false);
      };

      if (contentViewStep === 'PLAYER' && selectedChapter && selectedSubject) {
          if (type === 'VIDEO') {
            return <VideoPlaylistView chapter={selectedChapter} subject={selectedSubject} user={user} board={user.board || 'CBSE'} classLevel={user.classLevel || '10'} stream={user.stream || null} onBack={handlePlayerBack} onUpdateUser={handleUserUpdate} settings={settings} />;
          } else if (type === 'PDF') {
            return <PdfView chapter={selectedChapter} subject={selectedSubject} user={user} board={user.board || 'CBSE'} classLevel={user.classLevel || '10'} stream={user.stream || null} onBack={handlePlayerBack} onUpdateUser={handleUserUpdate} settings={settings} />;
          } else {
            return <McqView chapter={selectedChapter} subject={selectedSubject} user={user} board={user.board || 'CBSE'} classLevel={user.classLevel || '10'} stream={user.stream || null} onBack={handlePlayerBack} onUpdateUser={handleUserUpdate} settings={settings} />;
          }
      }

      if (contentViewStep === 'CHAPTERS' && selectedSubject) {
          return (
              <ChapterSelection 
                  chapters={chapters} 
                  subject={selectedSubject} 
                  classLevel={user.classLevel || '10'} 
                  loading={loadingChapters} 
                  user={user} 
                  onSelect={handleContentChapterSelect} 
                  onBack={() => { setContentViewStep('SUBJECTS'); onTabChange('COURSES'); }} 
              />
          );
      }

      // Subject List (Default View for Content Tabs)
      // NOTE: This part is technically not used if 'COURSES' tab handles the entry
      // But keeping it as fallback if we navigate directly.
      return null; 
  };

  const isGameEnabled = settings?.isGameEnabled ?? true;

  // --- RENDER BASED ON ACTIVE TAB ---
  const renderMainContent = () => {
      // 1. HOME TAB
      if (activeTab === 'HOME') { 
          return (
              <div className="space-y-6 pb-24">
                  {/* FEATURED & HERO SECTION */}
                  <div className="space-y-4 mb-6">
                      {/* NEW HERO SLIDER (App Features & Subscription) */}
                      <div className="relative h-48 rounded-2xl overflow-hidden shadow-xl mx-1 border border-white/20">
                          {slides.map((slide, index) => (
                              <div 
                                  key={slide.id}
                                  className={`absolute inset-0 bg-gradient-to-br ${slide.color} flex flex-col justify-center p-6 transition-all duration-1000 ${index === currentSlide ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
                              >
                                  <div className="text-white relative z-10">
                                      <div className="inline-block px-3 py-1 bg-black/20 rounded-full text-[10px] font-black tracking-widest mb-2 backdrop-blur-md border border-white/10 shadow-sm">
                                          ✨ FEATURED
                                      </div>
                                      <h2 className="text-3xl font-black mb-2 leading-none drop-shadow-md">{slide.title}</h2>
                                      <p className="text-sm font-medium opacity-90 mb-4 max-w-[80%]">{slide.subtitle}</p>
                                      
                                      <button onClick={() => onTabChange('STORE')} className="bg-white text-black px-4 py-2 rounded-lg text-xs font-bold shadow-lg hover:scale-105 transition-transform flex items-center gap-2">
                                          <Zap size={14} className="text-yellow-500 fill-yellow-500" /> Check Now
                                      </button>
                                  </div>
                                  {/* Animated Background Element */}
                                  <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/10 rounded-full blur-3xl animate-pulse"></div>
                              </div>
                          ))}
                          {/* Dots */}
                          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2 z-20">
                              {slides.map((_, i) => (
                                  <button 
                                      key={i} 
                                      onClick={() => setCurrentSlide(i)}
                                      className={`h-1.5 rounded-full transition-all duration-300 ${i === currentSlide ? 'w-8 bg-white shadow-[0_0_10px_white]' : 'w-2 bg-white/40 hover:bg-white/60'}`}
                                  ></button>
                              ))}
                          </div>
                      </div>

                      {/* ALL FEATURES GRID (Sara Future Dikhega) */}
                      <div>
                          <div className="flex items-center justify-between px-2 mb-3">
                              <h3 className="font-black text-slate-800 flex items-center gap-2">
                                  <Sparkles className="text-purple-500" size={18} /> App Features
                              </h3>
                              <button 
                                  onClick={() => setShowFeaturesModal(true)}
                                  className="text-[10px] font-bold bg-slate-200 text-slate-600 px-3 py-1 rounded-full hover:bg-slate-300 transition-colors"
                              >
                                  More ▾
                              </button>
                          </div>
                          
                          {/* SCROLLABLE FEATURES LIST */}
                          <div className="overflow-x-auto no-scrollbar pb-2 -mx-4 px-4">
                              <div className="flex gap-3 w-max">
                                  {[
                                      { id: 'VIDEO', label: 'Videos', icon: Youtube, color: 'text-red-500', bg: 'bg-red-50', hover: 'group-hover:bg-red-500' },
                                      { id: 'PDF', label: 'PDFs', icon: FileText, color: 'text-blue-500', bg: 'bg-blue-50', hover: 'group-hover:bg-blue-500' },
                                      { id: 'MCQ', label: 'Tests', icon: CheckSquare, color: 'text-purple-500', bg: 'bg-purple-50', hover: 'group-hover:bg-purple-500' },
                                      { id: 'STORE', label: 'Premium', icon: Crown, color: 'text-yellow-500', bg: 'bg-yellow-50', hover: 'group-hover:bg-yellow-500' },
                                      { id: 'LEADERBOARD', label: 'Rank List', icon: Trophy, color: 'text-orange-500', bg: 'bg-orange-50', hover: 'group-hover:bg-orange-500' },
                                      { id: 'CHAT', label: 'Chat', icon: MessageCircle, color: 'text-green-500', bg: 'bg-green-50', hover: 'group-hover:bg-green-500' },
                                      { id: 'GAME', label: 'Spin Win', icon: Gamepad2, color: 'text-pink-500', bg: 'bg-pink-50', hover: 'group-hover:bg-pink-500' },
                                      { id: 'PROFILE', label: 'Profile', icon: UserIcon, color: 'text-slate-500', bg: 'bg-slate-100', hover: 'group-hover:bg-slate-600' },
                                  ].map((item) => (
                                      <button 
                                          key={item.id} 
                                          onClick={() => onTabChange(item.id as StudentTab)} 
                                          className="aspect-square w-20 bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center justify-center gap-1 hover:shadow-md hover:scale-105 transition-all group shrink-0"
                                      >
                                          <div className={`w-10 h-10 ${item.bg} rounded-full flex items-center justify-center ${item.color} ${item.hover} group-hover:text-white transition-colors`}>
                                              <item.icon size={20} />
                                          </div>
                                          <span className="text-[10px] font-bold text-slate-600">{item.label}</span>
                                      </button>
                                  ))}
                              </div>
                          </div>
                      </div>

                      {/* SUBSCRIPTION PROMO BANNER (Inline with Credits) */}
                      <div onClick={() => onTabChange('STORE')} className="mx-1 bg-gradient-to-r from-slate-900 to-slate-800 p-4 rounded-2xl shadow-lg flex items-center justify-between cursor-pointer border border-slate-700 relative overflow-hidden group">
                          <div className="relative z-10">
                              <div className="flex items-center gap-2 mb-1">
                                  <Crown size={16} className="text-yellow-400 animate-pulse" />
                                  <span className="text-xs font-black text-white tracking-widest">PRO MEMBERSHIP</span>
                              </div>
                              <p className="text-[10px] text-slate-400">Unlock All Features + Get Credits</p>
                          </div>
                          <div className="relative z-10 flex flex-col items-end">
                              <span className="text-xl font-black text-white">BASIC / ULTRA</span>
                              <span className="text-[10px] font-bold bg-yellow-400 text-black px-2 py-0.5 rounded-full">+ 5000 Credits</span>
                          </div>
                          {/* Shine Effect */}
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                      </div>
                  </div>

                  {/* STATS HEADER */}
                  <div className="bg-slate-900 rounded-2xl p-4 text-white shadow-xl relative overflow-hidden">
                      <div className="flex items-center justify-between relative z-10">
                          <div>
                              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                                  <Timer size={12} /> Study Timer
                              </div>
                              <div className="text-2xl font-mono font-bold tracking-wider text-green-400">
                                  {formatTime(dailyStudySeconds)}
                              </div>
                          </div>
                          <div className="text-right">
                              <p className="text-[10px] text-slate-400 font-bold uppercase">Credits</p>
                              <div className="flex items-center justify-end gap-1">
                                  <Crown size={16} className="text-yellow-400" />
                                  <span className="text-xl font-black text-blue-400">{user.credits}</span>
                              </div>
                          </div>
                      </div>
                  </div>

                  {/* CONTENT REQUEST (DEMAND) SECTION */}
                  <div className="bg-gradient-to-r from-pink-50 to-rose-50 p-4 rounded-2xl border border-pink-100 shadow-sm mt-4">
                      <h3 className="font-bold text-pink-900 mb-2 flex items-center gap-2">
                          <Megaphone size={18} className="text-pink-600" /> Request Content
                      </h3>
                      <p className="text-xs text-slate-600 mb-4">Don't see what you need? Request it here!</p>
                      
                      <button 
                          onClick={() => {
                              // PRE-FILL FROM CURRENT SELECTIONS IF AVAILABLE (Better UX)
                              const board = user.board || 'CBSE';
                              const cls = user.classLevel || '10';
                              
                              // Use dropdowns instead of raw prompts for better experience
                              // Since we are inside a button click handler, we can't render JSX easily without a Modal state.
                              // Implementing a simple prompt sequence for now, but with options listed.
                              
                              const subName = prompt(`Enter Subject Name:\n(e.g., Math, Physics, Chemistry, English)\n\nCurrent Class: ${cls}`, "Math");
                              if (!subName) return;
                              
                              const chName = prompt("Enter Chapter Name or Topic:");
                              if (!chName) return;
                              
                              const typeInput = prompt("What content do you need?\n1. PDF Notes\n2. MCQ Test\n3. Video Lecture\n\nEnter 1, 2, or 3:", "1");
                              if (!typeInput) return;
                              
                              let type = 'PDF';
                              if (typeInput === '2' || typeInput.toLowerCase().includes('mcq')) type = 'MCQ';
                              else if (typeInput === '3' || typeInput.toLowerCase().includes('video')) type = 'VIDEO';

                              const request = {
                                  id: `req-${Date.now()}`,
                                  userId: user.id,
                                  userName: user.name,
                                  details: `${cls} ${board} - ${subName} - ${chName} - ${type}`,
                                  timestamp: new Date().toISOString()
                              };

                              // Save to Local Storage (Simulated Cloud Push)
                              const existing = JSON.parse(localStorage.getItem('nst_demand_requests') || '[]');
                              existing.push(request);
                              localStorage.setItem('nst_demand_requests', JSON.stringify(existing));
                              
                              // Push to Firebase
                              // Note: In a real app we'd use 'saveDemand' function, but here we simulate via LocalStorage sync or direct DB push if needed.
                              // Since AdminDashboard reads from 'nst_demand_requests' or Firebase, this works for now.
                              
                              alert("✅ Request Sent! Admin will check it.");
                          }}
                          className="w-full bg-white text-pink-600 font-bold py-3 rounded-xl shadow-sm border border-pink-200 hover:bg-pink-100 transition-colors flex items-center justify-center gap-2 text-sm"
                      >
                          + Make a Request
                      </button>
                  </div>

                  {/* MORE SERVICES GRID (2x4) */}
                  <div>
                      <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2 px-1">
                          <Layout size={18} /> More Services
                      </h3>
                      <div className="grid grid-cols-4 gap-3">
                          <button onClick={() => onTabChange('HISTORY')} className="aspect-square bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center gap-1 hover:bg-slate-50 transition-all">
                              <History size={20} className="text-blue-500" />
                              <span className="text-[10px] font-bold text-slate-600">History</span>
                          </button>
                          {isGameEnabled && (
                              <button onClick={() => onTabChange('GAME')} className="aspect-square bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center gap-1 hover:bg-slate-50 transition-all">
                                  <Gamepad2 size={20} className="text-orange-500" />
                                  <span className="text-[10px] font-bold text-slate-600">Game</span>
                              </button>
                          )}
                          <button onClick={() => onTabChange('REDEEM')} className="aspect-square bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center gap-1 hover:bg-slate-50 transition-all">
                              <Gift size={20} className="text-purple-500" />
                              <span className="text-[10px] font-bold text-slate-600">Redeem</span>
                          </button>
                          <button onClick={() => onTabChange('CHAT')} className="aspect-square bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center gap-1 hover:bg-slate-50 transition-all">
                              <MessageCircle size={20} className="text-green-500" />
                              <span className="text-[10px] font-bold text-slate-600">Support</span>
                          </button>
                          
                          {/* EXTERNAL APPS */}
                          {settings?.externalApps?.slice(0,4).map((app) => (
                              <button 
                                  key={app.id} 
                                  onClick={() => handleExternalAppClick(app)}
                                  className="aspect-square bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col items-center justify-center gap-1 hover:bg-slate-50 transition-all"
                              >
                                  {app.isLocked ? <Lock size={20} className="text-slate-400" /> : <Zap size={20} className="text-yellow-500" />}
                                  <span className="text-[10px] font-bold text-slate-600 truncate w-full text-center px-1">{app.name}</span>
                              </button>
                          ))}
                      </div>
                  </div>
              </div>
          );
      }

      // 2. COURSES TAB (Handles Video, Notes, MCQ Selection)
      if (activeTab === 'COURSES') {
          // If viewing a specific content type (from drilled down), show it
          // Note: Clicking a subject switches tab to VIDEO/PDF/MCQ, so COURSES just shows the Hub.
          return (
              <div className="space-y-6 pb-24">
                      <div className="flex items-center justify-between">
                          <h2 className="text-2xl font-black text-slate-800">My Study Hub</h2>
                          <button onClick={() => onTabChange('LEADERBOARD')} className="bg-yellow-100 text-yellow-700 px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1 hover:bg-yellow-200 transition">
                              <Trophy size={14} /> Rank List
                          </button>
                      </div>
                      
                      {/* Video Section */}
                      <div className="bg-red-50 p-4 rounded-2xl border border-red-100">
                          <h3 className="font-bold text-red-800 flex items-center gap-2 mb-2"><Youtube /> Video Lectures</h3>
                          <div className="grid grid-cols-2 gap-2">
                              {getSubjectsList(user.classLevel || '10', user.stream || null).map(s => (
                                  <button key={s.id} onClick={() => { onTabChange('VIDEO'); handleContentSubjectSelect(s); }} className="bg-white p-2 rounded-xl text-xs font-bold text-slate-700 shadow-sm border border-red-100 text-left">
                                      {s.name}
                                  </button>
                              ))}
                          </div>
                      </div>

                      {/* Notes Section */}
                      <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                          <h3 className="font-bold text-blue-800 flex items-center gap-2 mb-2"><FileText /> Notes Library</h3>
                          <div className="grid grid-cols-2 gap-2">
                              {getSubjectsList(user.classLevel || '10', user.stream || null).map(s => (
                                  <button key={s.id} onClick={() => { onTabChange('PDF'); handleContentSubjectSelect(s); }} className="bg-white p-2 rounded-xl text-xs font-bold text-slate-700 shadow-sm border border-blue-100 text-left">
                                      {s.name}
                                  </button>
                              ))}
                          </div>
                      </div>

                      {/* MCQ Section */}
                      <div className="bg-purple-50 p-4 rounded-2xl border border-purple-100">
                          <h3 className="font-bold text-purple-800 flex items-center gap-2 mb-2"><CheckSquare /> MCQ Practice</h3>
                          <div className="grid grid-cols-2 gap-2">
                              {getSubjectsList(user.classLevel || '10', user.stream || null).map(s => (
                                  <button key={s.id} onClick={() => { onTabChange('MCQ'); handleContentSubjectSelect(s); }} className="bg-white p-2 rounded-xl text-xs font-bold text-slate-700 shadow-sm border border-purple-100 text-left">
                                      {s.name}
                                  </button>
                              ))}
                          </div>
                      </div>
                  </div>
              );
      }

      // 3. SEASON TAB (New Syllabus Structure)
      if (activeTab === 'SEASON') {
          return (
              <SyllabusStructure 
                user={user} 
                startDate={settings?.seasonStartDate}
                onTopicClick={handleSeasonTopicClick} 
              />
          );
      }

      // 4. LEGACY TABS (Mapped to new structure or kept as sub-views)
      if (activeTab === 'HISTORY') return <HistoryPage user={user} onUpdateUser={handleUserUpdate} settings={settings} />;
      if (activeTab === 'LEADERBOARD') return <Leaderboard />;
      if (activeTab === 'GAME') return isGameEnabled ? (user.isGameBanned ? <div className="text-center py-20 bg-red-50 rounded-2xl border border-red-100"><Ban size={48} className="mx-auto text-red-500 mb-4" /><h3 className="text-lg font-bold text-red-700">Access Denied</h3><p className="text-sm text-red-600">Admin has disabled the game for your account.</p></div> : <SpinWheel user={user} onUpdateUser={handleUserUpdate} settings={settings} />) : null;
      if (activeTab === 'REDEEM') return <div className="animate-in fade-in slide-in-from-bottom-2 duration-300"><RedeemSection user={user} onSuccess={onRedeemSuccess} /></div>;
      if (activeTab === 'CHAT') return <UniversalChat currentUser={user} onUserUpdate={handleUserUpdate} settings={settings} />;
      if (activeTab === 'STORE') return <Store user={user} settings={settings} onUserUpdate={handleUserUpdate} />;
      if (activeTab === 'PROFILE') return (
                <div className="animate-in fade-in zoom-in duration-300 pb-24">
                    <div className={`rounded-3xl p-8 text-center text-white mb-6 shadow-xl relative overflow-hidden ${
                        user.subscriptionLevel === 'ULTRA' && user.isPremium 
                        ? 'bg-gradient-to-br from-yellow-500 via-orange-500 to-red-600 shadow-orange-500/50' 
                        : user.subscriptionLevel === 'BASIC' && user.isPremium
                        ? 'bg-gradient-to-br from-blue-500 via-indigo-500 to-cyan-500 shadow-blue-500/50'
                        : 'bg-gradient-to-br from-slate-700 to-slate-900'
                    }`}>
                        {/* ANIMATED BACKGROUND FOR ULTRA */}
                        {user.subscriptionLevel === 'ULTRA' && user.isPremium && (
                            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-30 animate-spin-slow"></div>
                        )}
                        
                        {/* ANIMATED BACKGROUND FOR BASIC */}
                        {user.subscriptionLevel === 'BASIC' && user.isPremium && (
                            <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent opacity-30 animate-pulse"></div>
                        )}

                        <div className={`w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto mb-4 text-4xl font-black shadow-2xl relative z-10 ${
                            user.subscriptionLevel === 'ULTRA' && user.isPremium ? 'text-orange-600 ring-4 ring-yellow-300 animate-bounce-slow' : 
                            user.subscriptionLevel === 'BASIC' && user.isPremium ? 'text-blue-600 ring-4 ring-cyan-300' : 
                            'text-slate-800'
                        }`}>
                            {user.name.charAt(0)}
                            {user.subscriptionLevel === 'ULTRA' && user.isPremium && <div className="absolute -top-2 -right-2 text-2xl">👑</div>}
                        </div>
                        
                        <h2 className="text-3xl font-black relative z-10">{user.name}</h2>
                        <p className="text-white/80 text-sm font-mono relative z-10">ID: {user.id}</p>
                        
                        <div className="mt-4 relative z-10">
                            <span className={`px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest ${
                                user.subscriptionLevel === 'ULTRA' && user.isPremium ? 'bg-yellow-400 text-black' : 
                                user.subscriptionLevel === 'BASIC' && user.isPremium ? 'bg-cyan-400 text-black' : 'bg-slate-600 text-slate-300'
                            }`}>
                                {user.isPremium ? `${user.subscriptionLevel} Member` : 'Free User'}
                            </span>
                        </div>
                    </div>
                    
                    <div className="space-y-4">
                        <div className="bg-white rounded-xl p-4 border border-slate-200">
                            <p className="text-xs font-bold text-slate-500 uppercase mb-1">Class</p>
                            <p className="text-lg font-black text-slate-800">{user.classLevel} • {user.board} • {user.stream}</p>
                        </div>
                        
                        <div className="bg-white rounded-xl p-4 border border-slate-200">
                            <p className="text-xs font-bold text-slate-500 uppercase mb-1">Subscription</p>
                            <p className="text-lg font-black text-slate-800">{user.subscriptionTier || 'FREE'}</p>
                            {user.subscriptionEndDate && <p className="text-xs text-slate-500 mt-1">Expires: {new Date(user.subscriptionEndDate).toLocaleDateString()}</p>}
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                                <p className="text-xs font-bold text-blue-600 uppercase">Credits</p>
                                <p className="text-2xl font-black text-blue-600">{user.credits}</p>
                            </div>
                            <div className="bg-orange-50 rounded-xl p-4 border border-orange-200">
                                <p className="text-xs font-bold text-orange-600 uppercase">Streak</p>
                                <p className="text-2xl font-black text-orange-600">{user.streak} Days</p>
                            </div>
                        </div>
                        
                        <button onClick={() => setEditMode(true)} className="w-full bg-slate-800 text-white py-3 rounded-xl font-bold hover:bg-slate-900">✏️ Edit Profile</button>
                        <button onClick={() => {localStorage.removeItem(`nst_user_${user.id}`); window.location.reload();}} className="w-full bg-red-500 text-white py-3 rounded-xl font-bold hover:bg-red-600">🚪 Logout</button>
                    </div>
                </div>
      );

      // Handle Drill-Down Views (Video, PDF, MCQ)
      if (activeTab === 'VIDEO' || activeTab === 'PDF' || activeTab === 'MCQ') {
          return renderContentSection(activeTab);
      }

      return null;
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
        {/* ADMIN SWITCH BUTTON */}
        {user.role === 'ADMIN' && (
             <div className="fixed bottom-24 right-4 z-50">
                 <button 
                    onClick={handleSwitchToAdmin}
                    className="bg-slate-900 text-white p-4 rounded-full shadow-2xl border-2 border-slate-700 hover:scale-110 transition-transform flex items-center gap-2 animate-bounce-slow"
                 >
                     <Layout size={20} className="text-yellow-400" />
                     <span className="font-bold text-xs">Admin Panel</span>
                 </button>
             </div>
        )}

        {/* NOTIFICATION BAR (Only on Home) */}
        {activeTab === 'HOME' && settings?.noticeText && (
            <div className="bg-gradient-to-r from-slate-900 to-blue-900 text-white p-4 mb-6 rounded-b-2xl shadow-lg border-b border-slate-700 animate-in slide-in-from-top-4 relative mx-4 mt-2">
                <div className="flex items-start gap-3">
                    <Megaphone size={20} className="text-yellow-400 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Notice Board</p>
                        <p className="text-sm font-medium leading-relaxed">{settings.noticeText}</p>
                    </div>
                </div>
            </div>
        )}

        {/* MAIN CONTENT AREA */}
        <div className="p-4">
            {renderMainContent()}
            
            <div className="mt-8 mb-4 text-center">
                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">
                    Developed by Nadim Anwar
                </p>
            </div>
        </div>

        {/* FIXED BOTTOM NAVIGATION */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-lg z-50 pb-safe">
            <div className="flex justify-around items-center h-16">
                <button onClick={() => { onTabChange('HOME'); setContentViewStep('SUBJECTS'); }} className={`flex flex-col items-center justify-center w-full h-full ${activeTab === 'HOME' ? 'text-blue-600' : 'text-slate-400'}`}>
                    <Home size={24} fill={activeTab === 'HOME' ? "currentColor" : "none"} />
                    <span className="text-[10px] font-bold mt-1">Home</span>
                </button>
                
                <button onClick={() => { onTabChange('SEASON'); }} className={`flex flex-col items-center justify-center w-full h-full ${activeTab === 'SEASON' ? 'text-blue-600' : 'text-slate-400'}`}>
                    <Calendar size={24} fill={activeTab === 'SEASON' ? "currentColor" : "none"} />
                    <span className="text-[10px] font-bold mt-1">Season</span>
                </button>

                <button onClick={() => { onTabChange('COURSES'); setContentViewStep('SUBJECTS'); }} className={`flex flex-col items-center justify-center w-full h-full ${activeTab === 'COURSES' || activeTab === 'PDF' || activeTab === 'MCQ' || activeTab === 'VIDEO' ? 'text-blue-600' : 'text-slate-400'}`}>
                    <Book size={24} fill={activeTab === 'COURSES' || activeTab === 'PDF' || activeTab === 'MCQ' || activeTab === 'VIDEO' ? "currentColor" : "none"} />
                    <span className="text-[10px] font-bold mt-1">Courses</span>
                </button>
                
                {settings?.isPaymentEnabled !== false && (
                    <button onClick={() => onTabChange('STORE')} className={`flex flex-col items-center justify-center w-full h-full ${activeTab === 'STORE' ? 'text-blue-600' : 'text-slate-400'}`}>
                        <ShoppingBag size={24} fill={activeTab === 'STORE' ? "currentColor" : "none"} />
                        <span className="text-[10px] font-bold mt-1">Store</span>
                    </button>
                )}
                <button onClick={() => onTabChange('PROFILE')} className={`flex flex-col items-center justify-center w-full h-full ${activeTab === 'PROFILE' ? 'text-blue-600' : 'text-slate-400'}`}>
                    <UserIcon size={24} fill={activeTab === 'PROFILE' ? "currentColor" : "none"} />
                    <span className="text-[10px] font-bold mt-1">Profile</span>
                </button>
            </div>
        </div>

        {/* MODALS */}
        {showUserGuide && <UserGuide onClose={() => setShowUserGuide(false)} />}
        
        {/* APP FEATURES MODAL */}
        {showFeaturesModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
                <div className="bg-white rounded-3xl w-full max-w-sm max-h-[80vh] flex flex-col shadow-2xl overflow-hidden">
                    <div className="p-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <Sparkles size={20} className="text-yellow-400" />
                            <h3 className="font-black text-lg">All Features</h3>
                        </div>
                        <button onClick={() => setShowFeaturesModal(false)} className="p-1.5 bg-white/20 rounded-full hover:bg-white/30 transition-colors">
                            <X size={18} />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 space-y-4">
                        <p className="text-sm text-slate-600 mb-4 bg-blue-50 p-3 rounded-xl border border-blue-100">
                            Explore everything IIC App has to offer! Use the dashboard to access these features.
                        </p>
                        
                        <div className="grid gap-3">
                            {[
                                "Smart Video Lectures", "PDF Notes Library", "MCQ Practice Zone", "Weekly Tests", 
                                "Live Leaderboard", "Engagement Rewards", "Universal Chat", "Private Admin Support", 
                                "Spin Wheel Game", "Credit System", "Subscription Plans", "Store & Payments", 
                                "Profile Customization", "Study Timer", "Streak System", "User Inbox", 
                                "Admin Dashboard", "Content Manager", "Bulk Upload", "Security System", 
                                "Performance History", "Dark/Light Mode Support", "Responsive Design", 
                                "PDF Watermarking", "Auto-Sync Content", "Offline Capabilities", 
                                "Guest Access", "Passwordless Login", "Custom Subjects", "Gift Codes", 
                                "Featured Shortcuts", "Notice Board", "Startup Ad", "External Apps Integration", 
                                "Activity Log", "AI Question Generator", "Class Management (6-12)", 
                                "Stream Support (Sci/Com/Arts)", "Board Support (CBSE/BSEB)", "Recycle Bin", 
                                "Data Backup", "Role Management", "Ban System", "Impersonation Mode", "Daily Goals"
                            ].map((feat, i) => (
                                <div key={i} className="flex items-center gap-3 p-2 border-b border-slate-100 last:border-0">
                                    <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">
                                        {i + 1}
                                    </div>
                                    <span className="text-sm font-medium text-slate-700">{feat}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="p-4 border-t bg-slate-50">
                        <button onClick={() => setShowFeaturesModal(false)} className="w-full py-3 bg-slate-800 text-white font-bold rounded-xl shadow-lg">Close</button>
                    </div>
                </div>
            </div>
        )}

        {editMode && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
                <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
                    {/* ... (Edit Profile Content - duplicated code removed for brevity, should use component) ... */}
                    {/* Re-implementing simplified edit mode here as it was inside a helper function before */}
                    <h3 className="font-bold text-lg mb-4">Edit Profile & Settings</h3>
                    <div className="space-y-3 mb-6">
                        <div><label className="text-xs font-bold text-slate-500 uppercase">Daily Study Goal (Hours)</label><input type="number" value={profileData.dailyGoalHours} onChange={e => setProfileData({...profileData, dailyGoalHours: Number(e.target.value)})} className="w-full p-2 border rounded-lg" min={1} max={12}/></div>
                        <div className="h-px bg-slate-100 my-2"></div>
                        <div><label className="text-xs font-bold text-slate-500 uppercase">New Password</label><input type="text" placeholder="Set new password (optional)" value={profileData.newPassword} onChange={e => setProfileData({...profileData, newPassword: e.target.value})} className="w-full p-2 border rounded-lg bg-yellow-50 border-yellow-200"/><p className="text-[9px] text-slate-400 mt-1">Leave blank to keep current password.</p></div>
                        <div className="h-px bg-slate-100 my-2"></div>
                        <div><label className="text-xs font-bold text-slate-500 uppercase">Board</label><select value={profileData.board} onChange={e => setProfileData({...profileData, board: e.target.value as any})} className="w-full p-2 border rounded-lg"><option value="CBSE">CBSE</option><option value="BSEB">BSEB</option></select></div>
                        <div><label className="text-xs font-bold text-slate-500 uppercase">Class</label><select value={profileData.classLevel} onChange={e => setProfileData({...profileData, classLevel: e.target.value as any})} className="w-full p-2 border rounded-lg">{['6','7','8','9','10','11','12'].map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                        {['11','12'].includes(profileData.classLevel) && (<div><label className="text-xs font-bold text-slate-500 uppercase">Stream</label><select value={profileData.stream} onChange={e => setProfileData({...profileData, stream: e.target.value as any})} className="w-full p-2 border rounded-lg"><option value="Science">Science</option><option value="Commerce">Commerce</option><option value="Arts">Arts</option></select></div>)}
                    </div>
                    <div className="flex gap-2"><button onClick={() => setEditMode(false)} className="flex-1 py-2 text-slate-500 font-bold">Cancel</button><button onClick={saveProfile} className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-bold">Save Changes</button></div>
                </div>
            </div>
        )}
        
        {showInbox && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
                <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
                    <div className="bg-slate-50 p-4 border-b border-slate-100 flex justify-between items-center">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2"><Mail size={18} className="text-blue-600" /> Admin Messages</h3>
                        <button onClick={() => setShowInbox(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                    </div>
                    <div className="max-h-80 overflow-y-auto p-4 space-y-3">
                        {(!user.inbox || user.inbox.length === 0) && <p className="text-slate-400 text-sm text-center py-8">No messages.</p>}
                        {user.inbox?.map(msg => (
                            <div key={msg.id} className={`p-3 rounded-xl border text-sm ${msg.read ? 'bg-white border-slate-100' : 'bg-blue-50 border-blue-100'}`}>
                                <div className="flex justify-between items-start mb-2"><p className="font-bold text-slate-500">MESSAGE</p><p className="text-slate-400 text-[10px]">{new Date(msg.date).toLocaleDateString()}</p></div>
                                <p className="text-slate-700 leading-relaxed">{msg.text}</p>
                            </div>
                        ))}
                    </div>
                    {unreadCount > 0 && <button onClick={markInboxRead} className="w-full py-3 bg-blue-600 text-white font-bold text-sm hover:opacity-90">Mark All as Read</button>}
                </div>
            </div>
        )}

        {isLoadingContent && <LoadingOverlay dataReady={isDataReady} onComplete={onLoadingComplete} />}
        {activeExternalApp && <div className="fixed inset-0 z-50 bg-white flex flex-col"><div className="flex items-center justify-between p-4 border-b bg-slate-50"><button onClick={() => setActiveExternalApp(null)} className="p-2 bg-white rounded-full border shadow-sm"><X size={20} /></button><p className="font-bold text-slate-700">External App</p><div className="w-10"></div></div><iframe src={activeExternalApp} className="flex-1 w-full border-none" title="External App" allow="camera; microphone; geolocation; payment" /></div>}
        {pendingApp && <CreditConfirmationModal title={`Access ${pendingApp.app.name}`} cost={pendingApp.cost} userCredits={user.credits} isAutoEnabledInitial={!!user.isAutoDeductEnabled} onCancel={() => setPendingApp(null)} onConfirm={(auto) => processAppAccess(pendingApp.app, pendingApp.cost, auto)} />}
        
        {/* SEASON CONTENT SELECTION MODAL */}
        {seasonContentSelection && (
            <div className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-200">
                <div className="bg-white rounded-t-3xl sm:rounded-3xl p-6 w-full max-w-sm shadow-2xl relative overflow-hidden">
                    {/* Header Decoration */}
                    <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500"></div>
                    
                    <div className="text-center mb-6 mt-2">
                        <div className="inline-block p-3 rounded-full bg-slate-100 mb-3 border-4 border-white shadow-lg">
                            <BookOpen size={28} className="text-slate-700" />
                        </div>
                        <h3 className="text-xl font-black text-slate-800 leading-tight mb-1">{seasonContentSelection.chapter.title}</h3>
                        <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">{seasonContentSelection.subject.name}</p>
                    </div>
                    
                    <div className="space-y-3">
                        {/* PDF / NOTES */}
                        <button 
                            onClick={() => {
                                setSelectedSubject(seasonContentSelection.subject);
                                setSelectedChapter(seasonContentSelection.chapter);
                                setContentViewStep('PLAYER');
                                setFullScreen(true);
                                onTabChange('PDF');
                                setSeasonContentSelection(null);
                            }}
                            className="w-full p-4 bg-white border-2 border-slate-100 hover:border-blue-500 hover:bg-blue-50 rounded-2xl flex items-center gap-4 group transition-all shadow-sm hover:shadow-md"
                        >
                            <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                <FileText size={24} />
                            </div>
                            <div className="text-left flex-1">
                                <h4 className="font-bold text-slate-800 group-hover:text-blue-700">PDF Notes</h4>
                                <p className="text-[10px] text-slate-400">Read Theory & Solutions</p>
                            </div>
                            <ArrowRight size={18} className="text-slate-300 group-hover:text-blue-500" />
                        </button>
                        
                        {/* VIDEO */}
                        <button 
                            onClick={() => {
                                setSelectedSubject(seasonContentSelection.subject);
                                setSelectedChapter(seasonContentSelection.chapter);
                                setContentViewStep('PLAYER');
                                setFullScreen(true);
                                onTabChange('VIDEO');
                                setSeasonContentSelection(null);
                            }}
                            className="w-full p-4 bg-white border-2 border-slate-100 hover:border-red-500 hover:bg-red-50 rounded-2xl flex items-center gap-4 group transition-all shadow-sm hover:shadow-md"
                        >
                            <div className="w-12 h-12 rounded-xl bg-red-100 text-red-600 flex items-center justify-center group-hover:bg-red-600 group-hover:text-white transition-colors">
                                <Youtube size={24} />
                            </div>
                            <div className="text-left flex-1">
                                <h4 className="font-bold text-slate-800 group-hover:text-red-700">Video Class</h4>
                                <p className="text-[10px] text-slate-400">Watch Explainer Videos</p>
                            </div>
                            <ArrowRight size={18} className="text-slate-300 group-hover:text-red-500" />
                        </button>

                        {/* EXTRAS ROW (MCQ + More) */}
                        <div className="grid grid-cols-2 gap-3">
                            <button 
                                onClick={() => {
                                    setSelectedSubject(seasonContentSelection.subject);
                                    setSelectedChapter(seasonContentSelection.chapter);
                                    setContentViewStep('PLAYER');
                                    setFullScreen(true);
                                    onTabChange('MCQ');
                                    setSeasonContentSelection(null);
                                }}
                                className="p-3 bg-white border-2 border-slate-100 hover:border-purple-500 hover:bg-purple-50 rounded-2xl flex flex-col items-center justify-center gap-2 group transition-all shadow-sm"
                            >
                                <CheckSquare size={20} className="text-purple-500 group-hover:scale-110 transition-transform" />
                                <span className="font-bold text-xs text-slate-700 group-hover:text-purple-700">Practice MCQs</span>
                            </button>
                            <button 
                                onClick={() => setSeasonContentSelection(null)}
                                className="p-3 bg-slate-100 hover:bg-slate-200 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all font-bold text-xs text-slate-500"
                            >
                                <X size={20} />
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};
