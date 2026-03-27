/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  updateDoc, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDoc,
  deleteDoc,
  Timestamp,
  increment,
  arrayUnion
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  User as FirebaseUser,
  signOut
} from 'firebase/auth';
import { db, auth } from './firebase';
import { 
  MapPin, 
  Clock, 
  TrendingUp, 
  TrendingDown, 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  Navigation, 
  Award, 
  Bell,
  LogOut,
  ChevronRight,
  Zap,
  ShieldCheck,
  History,
  Coffee,
  Utensils,
  Hospital,
  Film,
  Building2,
  X,
  Users,
  Flag,
  Tag,
  Star,
  Heart,
  User,
  AlertTriangle,
  Info,
  ChevronLeft,
  Map as MapIcon,
  LayoutList,
  Bus,
  Train,
  Sun,
  Moon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, addMinutes, isAfter, formatDistanceToNow } from 'date-fns';
import { getWaitTimePrediction, type PredictionOutput } from './services/geminiService';
import { getDocFromServer } from 'firebase/firestore';
import { MapView } from './components/MapView';

// --- Utility for Tailwind classes ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Icon Helper ---
const getCategoryIcon = (category: string) => {
  switch (category.toLowerCase()) {
    case 'cafe': return <Coffee className="w-6 h-6" />;
    case 'restaurant': return <Utensils className="w-6 h-6" />;
    case 'hospital': return <Hospital className="w-6 h-6" />;
    case 'cinema': return <Film className="w-6 h-6" />;
    case 'government': return <Building2 className="w-6 h-6" />;
    case 'bus': return <Bus className="w-6 h-6" />;
    case 'train': return <Train className="w-6 h-6" />;
    default: return <MapPin className="w-6 h-6" />;
  }
};

// --- Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Firestore Connection Test ---
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
    // We don't throw here to avoid crashing on the test connection if rules aren't set up for it
  }
}
testConnection();

// --- Types ---
interface Location {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: string;
  currentWaitTime: number;
  historicalBaseline: number;
  approxPeopleCount: number;
  lastUpdated: string;
  vibeTags?: string[];
  isOpen?: boolean;
  closingSoon?: boolean;
  history?: {
    time: string;
    waitTime: number;
  }[];
  forecast?: {
    time: string;
    predictedWait: number;
    trend: 'up' | 'down' | 'stable';
  }[];
  groupWaitTimes?: {
    groupSize: string;
    waitTime: number;
  }[];
}

interface LeaderboardEntry {
  id: string;
  displayName: string;
  karmaPoints: number;
  rank: number;
  avatarUrl?: string;
  status: string;
}

interface WaitReport {
  id: string;
  locationId: string;
  userId: string;
  status: 'No Wait' | 'Moving Fast' | 'Stuck';
  waitTime: number;
  timestamp: any;
  verifiedCount: number;
  verifiers: string[];
}

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  karmaPoints: number;
  status: 'Newbie' | 'Verified Reporter' | 'Oracle';
  avatarUrl?: string;
  favorites?: string[];
}

interface Activity {
  id: string;
  userId: string;
  userName: string;
  locationId: string;
  locationName: string;
  status: string;
  timestamp: any;
}

interface Reward {
  id: string;
  userId: string;
  title: string;
  description: string;
  code: string;
  expiryDate: string;
  type: 'Coffee' | 'Discount' | 'Priority';
  claimed: boolean;
  timestamp: any;
}

const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  { id: 'u1', displayName: 'Oracle_Sarah', karmaPoints: 1250, rank: 1, status: 'Oracle' },
  { id: 'u2', displayName: 'WaitTimeWizard', karmaPoints: 980, rank: 2, status: 'Oracle' },
  { id: 'u3', displayName: 'CoffeeRunner', karmaPoints: 750, rank: 3, status: 'Verified Reporter' },
  { id: 'u4', displayName: 'LineSkipper', karmaPoints: 620, rank: 4, status: 'Verified Reporter' },
  { id: 'u5', displayName: 'DailyCommuter', karmaPoints: 450, rank: 5, status: 'Verified Reporter' },
];

const MOCK_NOTIFICATIONS = [
  { id: 'n1', title: 'New Reward Available!', description: 'You have earned enough karma for a free coffee.', time: '2h ago', type: 'reward' },
  { id: 'n2', title: 'Wait Time Spike', description: 'Wait times at Blue Bottle Coffee are increasing rapidly.', time: '5h ago', type: 'alert' },
  { id: 'n3', title: 'Weekly Recap', description: 'You earned 120 karma points this week. Top 10%!', time: '1d ago', type: 'system' },
];

// --- Mock Data for Initial Locations ---
const MOCK_LOCATIONS: Location[] = [
  {
    id: 'loc-1',
    name: 'Main Post Office',
    address: '123 Postal Way, Downtown',
    lat: 37.7749,
    lng: -122.4194,
    category: 'Government',
    currentWaitTime: 15,
    historicalBaseline: 25,
    approxPeopleCount: 12,
    lastUpdated: new Date().toISOString(),
    vibeTags: ['Quiet', 'Efficient'],
    forecast: [
      { time: '12:00 PM', predictedWait: 20, trend: 'up' },
      { time: '1:00 PM', predictedWait: 15, trend: 'down' },
      { time: '2:00 PM', predictedWait: 10, trend: 'down' }
    ]
  },
  {
    id: 'loc-2',
    name: 'Blue Bottle Coffee',
    address: '456 Caffeine St, SOMA',
    lat: 37.7833,
    lng: -122.4167,
    category: 'Cafe',
    currentWaitTime: 8,
    historicalBaseline: 5,
    approxPeopleCount: 18,
    lastUpdated: new Date().toISOString(),
    vibeTags: ['Loud Music', 'Great for Laptop'],
    forecast: [
      { time: '12:00 PM', predictedWait: 12, trend: 'up' },
      { time: '1:00 PM', predictedWait: 15, trend: 'up' },
      { time: '2:00 PM', predictedWait: 8, trend: 'down' }
    ],
    groupWaitTimes: [
      { groupSize: '1-2', waitTime: 5 },
      { groupSize: '3-4', waitTime: 12 },
      { groupSize: '5+', waitTime: 25 }
    ]
  },
  {
    id: 'loc-3',
    name: 'Department of Motor Vehicles',
    address: '789 Bureaucracy Blvd',
    lat: 37.7667,
    lng: -122.4333,
    category: 'Government',
    currentWaitTime: 45,
    historicalBaseline: 60,
    approxPeopleCount: 54,
    lastUpdated: new Date().toISOString(),
    vibeTags: ['Long Lines', 'Bring a Book'],
    forecast: [
      { time: '12:00 PM', predictedWait: 55, trend: 'up' },
      { time: '1:00 PM', predictedWait: 65, trend: 'up' },
      { time: '2:00 PM', predictedWait: 40, trend: 'down' }
    ]
  },
  {
    id: 'loc-4',
    name: 'St. Mary\'s Hospital',
    address: '100 Health Ave, Medical District',
    lat: 37.7700,
    lng: -122.4500,
    category: 'Hospital',
    currentWaitTime: 120,
    historicalBaseline: 90,
    approxPeopleCount: 85,
    lastUpdated: new Date().toISOString(),
    vibeTags: ['Busy', 'High Priority'],
    groupWaitTimes: [
      { groupSize: '1', waitTime: 120 },
      { groupSize: '2+', waitTime: 150 }
    ]
  },
  {
    id: 'loc-5',
    name: 'The Grand Cinema',
    address: '222 Movie Lane, Entertainment Hub',
    lat: 37.7800,
    lng: -122.4000,
    category: 'Cinema',
    currentWaitTime: 10,
    historicalBaseline: 15,
    approxPeopleCount: 22,
    lastUpdated: new Date().toISOString(),
    vibeTags: ['Smells like Popcorn', 'Cold AC'],
    forecast: [
      { time: '6:00 PM', predictedWait: 25, trend: 'up' },
      { time: '8:00 PM', predictedWait: 45, trend: 'up' },
      { time: '10:00 PM', predictedWait: 15, trend: 'down' }
    ]
  },
  {
    id: 'loc-6',
    name: 'Pasta Palace',
    address: '333 Italian Way, Little Italy',
    lat: 37.7900,
    lng: -122.4100,
    category: 'Restaurant',
    currentWaitTime: 35,
    historicalBaseline: 20,
    approxPeopleCount: 40,
    lastUpdated: new Date().toISOString(),
    vibeTags: ['Romantic', 'Authentic'],
    groupWaitTimes: [
      { groupSize: '2', waitTime: 35 },
      { groupSize: '4', waitTime: 50 },
      { groupSize: '6+', waitTime: 90 }
    ]
  },
  {
    id: 'loc-7',
    name: 'Starbucks Reserve',
    address: '555 Market St, Financial District',
    lat: 37.7880,
    lng: -122.4010,
    category: 'Cafe',
    currentWaitTime: 12,
    historicalBaseline: 10,
    approxPeopleCount: 15,
    lastUpdated: new Date().toISOString()
  },
  {
    id: 'loc-8',
    name: 'City General Hospital ER',
    address: '400 Emergency Rd',
    lat: 37.7500,
    lng: -122.4200,
    category: 'Hospital',
    currentWaitTime: 180,
    historicalBaseline: 150,
    approxPeopleCount: 110,
    lastUpdated: new Date().toISOString()
  },
  {
    id: 'loc-9',
    name: 'AMC Metreon 16',
    address: '135 4th St, Yerba Buena',
    lat: 37.7840,
    lng: -122.4030,
    category: 'Cinema',
    currentWaitTime: 5,
    historicalBaseline: 10,
    approxPeopleCount: 8,
    lastUpdated: new Date().toISOString()
  },
  {
    id: 'loc-10',
    name: 'Burger King',
    address: '1200 Market St',
    lat: 37.7780,
    lng: -122.4150,
    category: 'Restaurant',
    currentWaitTime: 7,
    historicalBaseline: 5,
    approxPeopleCount: 12,
    lastUpdated: new Date().toISOString()
  },
  {
    id: 'loc-11',
    name: 'Central Bus Stand',
    address: '50 Transit Plaza',
    lat: 37.7750,
    lng: -122.4180,
    category: 'Bus',
    currentWaitTime: 12,
    historicalBaseline: 10,
    approxPeopleCount: 45,
    lastUpdated: new Date().toISOString()
  },
  {
    id: 'loc-12',
    name: 'Union Train Station',
    address: '100 Rail Way',
    lat: 37.7790,
    lng: -122.3950,
    category: 'Train',
    currentWaitTime: 5,
    historicalBaseline: 8,
    approxPeopleCount: 120,
    lastUpdated: new Date().toISOString()
  },
  {
    id: 'loc-13',
    name: 'North Point Bus Stop',
    address: 'Bay & Mason St',
    lat: 37.8050,
    lng: -122.4130,
    category: 'Bus',
    currentWaitTime: 8,
    historicalBaseline: 5,
    approxPeopleCount: 15,
    lastUpdated: new Date().toISOString()
  }
];

// --- Components ---

const Button = ({ 
  children, 
  variant = 'primary', 
  className, 
  ...props 
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' }) => {
  const variants = {
    primary: 'bg-stone-900 text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200 shadow-sm',
    secondary: 'bg-stone-100 text-stone-900 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-100 dark:hover:bg-stone-700 shadow-sm',
    outline: 'border border-stone-200 hover:border-stone-900 text-stone-900 dark:border-stone-700 dark:hover:border-stone-500 dark:text-stone-100',
    ghost: 'hover:bg-stone-100 text-stone-600 dark:hover:bg-stone-800 dark:text-stone-400',
    danger: 'bg-rose-700 text-white hover:bg-rose-800 shadow-sm'
  };
  
  return (
    <button 
      className={cn(
        'px-4 py-2 rounded-lg font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 text-sm',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};

const Card = ({ children, className, ...props }: { children: React.ReactNode, className?: string, [key: string]: any }) => (
  <motion.div 
    whileHover={{ y: -1 }}
    className={cn('bg-white border border-stone-200 rounded-xl shadow-sm overflow-hidden dark:bg-stone-950 dark:border-stone-900', className)} 
    {...props}
  >
    {children}
  </motion.div>
);

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [prediction, setPrediction] = useState<PredictionOutput | null>(null);
  const [loadingPrediction, setLoadingPrediction] = useState(false);
  const [isProblemModalOpen, setIsProblemModalOpen] = useState(false);
  const [problemType, setProblemType] = useState<'Incorrect Wait Time' | 'Closed' | 'Wrong Address' | 'Other'>('Incorrect Wait Time');
  const [problemDescription, setProblemDescription] = useState('');
  const [isSubmittingProblem, setIsSubmittingProblem] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isReporting, setIsReporting] = useState(false);
  const [reports, setReports] = useState<WaitReport[]>([]);
  const [userReports, setUserReports] = useState<WaitReport[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isQuickReportOpen, setIsQuickReportOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [activeAlerts, setActiveAlerts] = useState<string[]>([]);
  const [showOnlyOpen, setShowOnlyOpen] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([
    { id: 'a1', userId: 'u1', userName: 'Oracle_Sarah', locationId: 'loc-1', locationName: 'Main Post Office', status: 'Reported 15m wait', timestamp: new Date() },
    { id: 'a2', userId: 'u2', userName: 'WaitTimeWizard', locationId: 'loc-2', locationName: 'Blue Bottle Coffee', status: 'Verified report', timestamp: new Date(Date.now() - 1000 * 60 * 15) },
    { id: 'a3', userId: 'u3', userName: 'CoffeeRunner', locationId: 'loc-3', locationName: 'City Hospital', status: 'Reported 45m wait', timestamp: new Date(Date.now() - 1000 * 60 * 30) },
  ]);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('darkMode') === 'true' || 
             (!localStorage.getItem('darkMode') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  const [isAuthReady, setIsAuthReady] = useState(false);

  // --- Theme ---
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', darkMode.toString());
  }, [darkMode]);

  // --- Auth ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const userDoc = await getDoc(doc(db, 'users', u.uid));
          if (userDoc.exists()) {
            setProfile(userDoc.data() as UserProfile);
          } else {
            const newProfile: UserProfile = {
              uid: u.uid,
              email: u.email || '',
              displayName: u.displayName || 'Anonymous',
              karmaPoints: 0,
              status: 'Newbie'
            };
            await setDoc(doc(db, 'users', u.uid), newProfile);
            setProfile(newProfile);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${u.uid}`);
        }
      } else {
        setProfile(null);
      }
      setIsAuthReady(true);
    });
    return unsubscribe;
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  const handleLogout = () => signOut(auth);

  const handleShare = async (location: Location) => {
    const shareText = `Check out the wait time at ${location.name}: ${location.currentWaitTime}m! Reported via Oracle.`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Oracle Wait Time',
          text: shareText,
          url: window.location.href,
        });
      } else {
        await navigator.clipboard.writeText(shareText);
        alert('Wait time info copied to clipboard!');
      }
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const claimReward = async (rewardId: string) => {
    try {
      await updateDoc(doc(db, 'rewards', rewardId), { claimed: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `rewards/${rewardId}`);
    }
  };

  const redeemKarma = async () => {
    if (!profile || profile.karmaPoints < 50) return;
    
    try {
      const rewardData: Omit<Reward, 'id'> = {
        userId: user!.uid,
        title: 'Free Espresso Shot',
        description: 'Redeem at any partner cafe',
        code: Math.random().toString(36).substring(2, 8).toUpperCase(),
        expiryDate: format(addMinutes(new Date(), 60 * 24 * 7), 'yyyy-MM-dd'),
        type: 'Coffee',
        claimed: false,
        timestamp: Timestamp.now()
      };
      
      await addDoc(collection(db, 'rewards'), rewardData);
      await updateDoc(doc(db, 'users', user!.uid), {
        karmaPoints: increment(-50)
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'rewards');
    }
  };

  // --- Data Fetching ---
  useEffect(() => {
    if (!isAuthReady) return;
    
    // In a real app, this would be a real collection
    // For now, we'll use the mock data and sync with Firestore if it exists
    const unsubscribe = onSnapshot(collection(db, 'locations'), (snapshot) => {
      if (snapshot.empty) {
        // Seed mock data if empty AND user is logged in (to avoid unauth write errors)
        if (user) {
          MOCK_LOCATIONS.forEach(loc => {
            setDoc(doc(db, 'locations', loc.id), loc).catch(e => {
              // Only log if it's not a permission error (admins will succeed, others will fail silently)
              if (!(e instanceof Error && e.message.includes('insufficient permissions'))) {
                handleFirestoreError(e, OperationType.WRITE, `locations/${loc.id}`);
              }
            });
          });
        }
        setLocations(MOCK_LOCATIONS);
      } else {
        const locs = snapshot.docs.map(doc => doc.data() as Location);
        setLocations(locs);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'locations');
    });
    return unsubscribe;
  }, [isAuthReady, user]);

  useEffect(() => {
    if (!isAuthReady || !selectedLocation) return;
    
    const q = query(
      collection(db, `locations/${selectedLocation.id}/reports`),
      orderBy('timestamp', 'desc'),
      limit(10)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const reps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as WaitReport);
      setReports(reps);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `locations/${selectedLocation.id}/reports`);
    });
    return unsubscribe;
  }, [isAuthReady, selectedLocation]);

  // --- User Specific Data (Reports & Rewards) ---
  useEffect(() => {
    if (!isAuthReady || !user) return;

    // Fetch User Reports
    const reportsQuery = query(
      collection(db, 'reports'),
      where('userId', '==', user.uid),
      orderBy('timestamp', 'desc'),
      limit(20)
    );
    const unsubscribeReports = onSnapshot(reportsQuery, (snapshot) => {
      const reps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as WaitReport);
      setUserReports(reps);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'reports');
    });

    // Fetch Rewards
    const rewardsQuery = query(
      collection(db, 'rewards'),
      where('userId', '==', user.uid),
      orderBy('timestamp', 'desc')
    );
    const unsubscribeRewards = onSnapshot(rewardsQuery, (snapshot) => {
      const rews = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Reward);
      setRewards(rews);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'rewards');
    });

    return () => {
      unsubscribeReports();
      unsubscribeRewards();
    };
  }, [isAuthReady, user]);

  useEffect(() => {
    if (!isAuthReady || !user) return;

    const unsubscribe = onSnapshot(collection(db, `users/${user.uid}/favorites`), (snapshot) => {
      const favs = snapshot.docs.map(doc => doc.id);
      setFavorites(favs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/favorites`);
    });

    return unsubscribe;
  }, [isAuthReady, user]);

  const toggleFavorite = async (locationId: string) => {
    if (!user) return;
    
    const isFav = favorites.includes(locationId);
    const favRef = doc(db, `users/${user.uid}/favorites`, locationId);

    try {
      if (isFav) {
        await deleteDoc(favRef);
      } else {
        await setDoc(favRef, {
          locationId,
          timestamp: Timestamp.now()
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/favorites/${locationId}`);
    }
  };

  // --- AI Prediction ---
  const fetchPrediction = async (loc: Location) => {
    setLoadingPrediction(true);
    try {
      const pred = await getWaitTimePrediction({
        locationName: loc.name,
        currentWaitTime: loc.currentWaitTime,
        historicalBaseline: loc.historicalBaseline,
        weather: 'Sunny, 72°F', // Mocked weather
        localEvents: [], // Mocked events
        timeOfDay: format(new Date(), 'h:mm a')
      });

      // Implement the 'Go Now' vs. 'Wait' toggle logic based on the AI prediction
      // Display 'GO NOW' when the predicted wait time is significantly shorter 
      // than the historical baseline and 'WAIT' otherwise.
      // "Significantly shorter" defined as at least 20% shorter or 5 minutes shorter.
      const isSignificantlyShorter = pred.predictedWaitTime <= loc.historicalBaseline * 0.8 || 
                                    (loc.historicalBaseline - pred.predictedWaitTime) >= 5;
      
      pred.recommendation = isSignificantlyShorter ? 'GO NOW' : 'WAIT';

      setPrediction(pred);
    } catch (error) {
      console.error('Prediction failed:', error);
    } finally {
      setLoadingPrediction(false);
    }
  };

  useEffect(() => {
    if (selectedLocation) {
      fetchPrediction(selectedLocation);
    } else {
      setPrediction(null);
    }
  }, [selectedLocation]);

  // --- Actions ---
  const submitReport = async (status: WaitReport['status'], waitTime: number) => {
    if (!user || !selectedLocation) return;

    const reportData: Omit<WaitReport, 'id'> = {
      locationId: selectedLocation.id,
      userId: user.uid,
      status,
      waitTime,
      timestamp: Timestamp.now(),
      verifiedCount: 0,
      verifiers: []
    };

    try {
      const reportRef = await addDoc(collection(db, `locations/${selectedLocation.id}/reports`), reportData);
      // Also add to global reports for profile history
      await setDoc(doc(db, 'reports', reportRef.id), {
        ...reportData,
        locationName: selectedLocation.name
      });
      
      // Update location current wait time (simple average for demo)
      const newWaitTime = Math.round((selectedLocation.currentWaitTime + waitTime) / 2);
      await updateDoc(doc(db, 'locations', selectedLocation.id), {
        currentWaitTime: newWaitTime,
        lastUpdated: new Date().toISOString()
      });

      // Reward user
      await updateDoc(doc(db, 'users', user.uid), {
        karmaPoints: increment(5)
      });

      setIsReporting(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `locations/${selectedLocation.id}/reports`);
    }
  };

  const verifyReport = async (report: WaitReport) => {
    if (!user || report.verifiers.includes(user.uid)) return;

    try {
      const reportRef = doc(db, `locations/${selectedLocation!.id}/reports`, report.id);
      const globalReportRef = doc(db, 'reports', report.id);

      await updateDoc(reportRef, {
        verifiedCount: increment(1),
        verifiers: arrayUnion(user.uid)
      });

      // Also update global report if it exists (it should if submitted via this app)
      try {
        await updateDoc(globalReportRef, {
          verifiedCount: increment(1),
          verifiers: arrayUnion(user.uid)
        });
      } catch (e) {
        // Global report might not exist for old data or if submitted differently
        console.warn('Global report update failed:', e);
      }

      // Reward both
      await updateDoc(doc(db, 'users', user.uid), { karmaPoints: increment(2) });
      await updateDoc(doc(db, 'users', report.userId), { karmaPoints: increment(10) });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `locations/${selectedLocation!.id}/reports/${report.id}`);
    }
  };

  const handleReportProblem = async () => {
    if (!user || !selectedLocation) return;
    setIsSubmittingProblem(true);

    const problemData = {
      locationId: selectedLocation.id,
      userId: user.uid,
      type: problemType,
      description: problemDescription,
      timestamp: Timestamp.now(),
      status: 'Pending'
    };

    try {
      await addDoc(collection(db, `locations/${selectedLocation.id}/problem_reports`), problemData);
      setIsProblemModalOpen(false);
      setProblemDescription('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `locations/${selectedLocation.id}/problem_reports`);
    } finally {
      setIsSubmittingProblem(false);
    }
  };

  // --- Filtered Locations ---
  const filteredLocations = useMemo(() => {
    return locations.filter(loc => {
      const matchesSearch = loc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           loc.category.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesOpen = showOnlyOpen ? loc.isOpen : true;
      return matchesSearch && matchesOpen;
    });
  }, [locations, searchQuery, showOnlyOpen]);

  // --- Render ---

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F9F9F9] dark:bg-[#000000] flex flex-col items-center justify-center p-6 font-sans transition-colors duration-300">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center space-y-8"
        >
          <div className="flex justify-center">
            <div className="w-20 h-20 bg-black dark:bg-stone-100 rounded-3xl flex items-center justify-center shadow-xl rotate-3">
              <Zap className="text-white dark:text-stone-900 w-10 h-10" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-stone-100">Wait Time Oracle</h1>
            <p className="text-zinc-500 dark:text-stone-400 text-lg">Know the wait before you go. Real-time crowdsourced predictions for the modern world.</p>
          </div>
          <Button onClick={handleLogin} className="w-full py-4 text-lg rounded-2xl shadow-lg bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 hover:bg-stone-800 dark:hover:bg-stone-200">
            <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
            Sign in with Google
          </Button>
          <div className="pt-8 grid grid-cols-3 gap-4 text-xs font-medium text-zinc-400 dark:text-stone-700 uppercase tracking-widest">
            <div className="flex flex-col items-center gap-2">
              <ShieldCheck className="w-5 h-5" />
              Verified
            </div>
            <div className="flex flex-col items-center gap-2">
              <Navigation className="w-5 h-5" />
              Real-time
            </div>
            <div className="flex flex-col items-center gap-2">
              <Award className="w-5 h-5" />
              Rewards
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFCFB] dark:bg-[#0A0A0A] font-sans pb-24 organic-grid transition-colors duration-500">
      {/* Header */}
      <header className="sticky top-0 z-[100] bg-white/40 dark:bg-black/40 backdrop-blur-xl border-b border-stone-200/50 dark:border-stone-900/50 px-8 py-5 flex items-center justify-between transition-all duration-500">
        <div className="flex items-center gap-4">
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              setSelectedLocation(null);
              setIsProfileOpen(false);
            }}
            className="w-11 h-11 bg-[#1A1A1A] dark:bg-[#E5E5E5] rounded-xl flex items-center justify-center shadow-premium transition-transform"
          >
            <Zap className="text-white dark:text-[#1A1A1A] w-5 h-5 fill-current" />
          </motion.button>
          <div className="flex flex-col">
            <span className="font-serif font-medium text-xl tracking-tight leading-none text-[#1A1A1A] dark:text-[#E5E5E5]">Wait Intelligence</span>
            <span className="text-[9px] uppercase tracking-[0.2em] text-stone-400 dark:text-stone-500 font-bold mt-1.5">Predictive Analytics Engine</span>
          </div>
        </div>
        <div className="flex items-center gap-8">
          <button 
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="hidden sm:flex flex-col items-end hover:opacity-70 transition-opacity"
          >
            <span className="text-sm font-serif font-medium text-[#1A1A1A] dark:text-[#E5E5E5]">{profile?.displayName}</span>
            <span className="text-[9px] uppercase tracking-widest text-stone-400 dark:text-stone-500 font-bold flex items-center gap-2 bg-stone-50 dark:bg-stone-900 px-2.5 py-1 rounded-full border border-stone-100 dark:border-stone-800">
              <Award className="w-3 h-3" />
              {profile?.karmaPoints} pts • {profile?.status}
            </span>
          </button>
          <div className="flex items-center gap-3">
            <motion.button 
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setDarkMode(!darkMode)}
              className="w-10 h-10 flex items-center justify-center hover:bg-stone-50 dark:hover:bg-stone-900 rounded-full transition-all text-stone-400 hover:text-[#1A1A1A] dark:hover:text-[#E5E5E5] border border-transparent hover:border-stone-100 dark:hover:border-stone-800"
              title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </motion.button>
            <motion.button 
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="w-10 h-10 flex items-center justify-center hover:bg-stone-50 dark:hover:bg-stone-900 rounded-full transition-all text-stone-400 hover:text-[#1A1A1A] dark:hover:text-[#E5E5E5] border border-transparent hover:border-stone-100 dark:hover:border-stone-800"
            >
              <User className="w-4 h-4" />
            </motion.button>
            <motion.button 
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleLogout} 
              className="w-10 h-10 flex items-center justify-center hover:bg-stone-50 dark:hover:bg-stone-900 rounded-full transition-all text-stone-400 hover:text-rose-500 border border-transparent hover:border-stone-100 dark:hover:border-stone-800"
            >
              <LogOut className="w-4 h-4" />
            </motion.button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-6 space-y-6">
        {isProfileOpen ? (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-8"
          >
            {/* Profile Header */}
            <div className="flex items-center justify-between">
              <button 
                onClick={() => {
                  setIsProfileOpen(false);
                  setSelectedLocation(null);
                }}
                className="flex items-center gap-2 text-sm font-bold text-stone-400 dark:text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Back to Dashboard
              </button>
              <div className="text-[9px] font-bold text-stone-500 dark:text-stone-400 bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 px-3 py-1 rounded uppercase tracking-widest">
                User Profile
              </div>
            </div>
            
            <div className="bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-900 rounded-2xl p-8 shadow-sm flex flex-col items-center text-center space-y-6">
              <div className="w-24 h-24 bg-stone-900 dark:bg-stone-100 rounded-full flex items-center justify-center text-white dark:text-stone-900 text-3xl font-bold shadow-xl">
                {profile?.displayName[0]}
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-sans font-bold tracking-tight text-stone-900 dark:text-stone-100">{profile?.displayName}</h1>
                <p className="text-sm text-stone-500 dark:text-stone-400 font-medium">{profile?.email}</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 px-4 py-2 rounded-xl text-center">
                  <div className="text-xl font-bold text-stone-900 dark:text-stone-100">{profile?.karmaPoints}</div>
                  <div className="text-[8px] uppercase font-bold tracking-widest text-stone-400 dark:text-stone-500">Karma Points</div>
                </div>
                <div className="bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 px-4 py-2 rounded-xl text-center">
                  <div className="text-xl font-bold text-stone-900 dark:text-stone-100">{profile?.status}</div>
                  <div className="text-[8px] uppercase font-bold tracking-widest text-stone-400 dark:text-stone-500">Status Level</div>
                </div>
              </div>
              {profile && profile.karmaPoints >= 50 && (
                <button 
                  onClick={redeemKarma}
                  className="bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-stone-800 dark:hover:bg-stone-200 transition-all active:scale-95 shadow-lg"
                >
                  Redeem 50 Karma for Reward
                </button>
              )}
            </div>

            {/* Favorites Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between px-2">
                <h2 className="text-[9px] font-bold uppercase tracking-[0.15em] text-stone-400 dark:text-stone-500">Favorite Locations</h2>
                <div className="text-[9px] font-bold text-stone-500 dark:text-stone-400 bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 px-2 py-0.5 rounded">
                  {favorites.length} Saved
                </div>
              </div>
              <div className="space-y-3">
                {favorites.length === 0 ? (
                  <div className="bg-stone-50 dark:bg-stone-900/50 border border-stone-200 dark:border-stone-800 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center gap-3 text-center">
                    <Heart className="w-8 h-8 text-stone-200 dark:text-stone-800" />
                    <p className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">No favorites yet</p>
                    <p className="text-[10px] text-stone-400 dark:text-stone-500 max-w-[200px]">Mark locations as favorites for quick access to wait times</p>
                  </div>
                ) : (
                  locations.filter(loc => favorites.includes(loc.id)).map((loc) => (
                    <Card 
                      key={loc.id} 
                      className="hover:border-stone-400 dark:hover:border-stone-500 transition-all cursor-pointer group"
                      onClick={() => {
                        setSelectedLocation(loc);
                        setIsProfileOpen(false);
                      }}
                    >
                      <div className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-stone-50 dark:bg-stone-800 rounded-lg flex items-center justify-center group-hover:bg-stone-100 dark:group-hover:bg-stone-700 transition-all text-stone-400 dark:text-stone-500 shadow-inner-soft border border-stone-100 dark:border-stone-700">
                            {getCategoryIcon(loc.category)}
                          </div>
                          <div>
                            <h3 className="font-sans font-bold text-base text-stone-900 dark:text-stone-100 group-hover:text-stone-900 dark:group-hover:text-stone-50 transition-colors">{loc.name}</h3>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[8px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 px-1.5 py-0.5 rounded">{loc.category}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right flex flex-col items-end">
                          <div className={cn(
                            "text-xl font-sans font-bold tracking-tight",
                            loc.currentWaitTime > 30 ? "text-red-800 dark:text-red-400" : loc.currentWaitTime > 15 ? "text-amber-800 dark:text-amber-400" : "text-emerald-800 dark:text-emerald-400"
                          )}>
                            {loc.currentWaitTime}m
                          </div>
                          <div className="text-[8px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">Current Wait</div>
                        </div>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </div>

            {/* Rewards Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between px-2">
                <h2 className="text-[9px] font-bold uppercase tracking-[0.15em] text-stone-400 dark:text-stone-500">Earned Rewards</h2>
                <div className="text-[9px] font-bold text-stone-500 dark:text-stone-400 bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 px-2 py-0.5 rounded">
                  {rewards.length} Available
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {rewards.length === 0 ? (
                  <div className="col-span-full bg-stone-50 dark:bg-stone-900/50 border border-stone-200 dark:border-stone-800 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center gap-3 text-center">
                    <Award className="w-8 h-8 text-stone-200 dark:text-stone-800" />
                    <p className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">No rewards earned yet</p>
                    <p className="text-[10px] text-stone-400 dark:text-stone-500 max-w-[200px]">Contribute data to earn karma points and unlock rewards</p>
                  </div>
                ) : rewards.map((rew) => (
                  <Card key={rew.id} className={cn("p-5 border-stone-200 dark:border-stone-800 relative overflow-hidden", rew.claimed && "opacity-60")}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-3">
                        <div className="w-10 h-10 bg-stone-50 dark:bg-stone-800 border border-stone-100 dark:border-stone-700 rounded-lg flex items-center justify-center text-stone-400 dark:text-stone-500">
                          {rew.type === 'Coffee' ? <Coffee className="w-5 h-5" /> : <Tag className="w-5 h-5" />}
                        </div>
                        <div>
                          <h3 className="font-bold text-sm text-stone-900 dark:text-stone-100">{rew.title}</h3>
                          <p className="text-[10px] text-stone-500 dark:text-stone-400 font-medium">{rew.description}</p>
                        </div>
                        {!rew.claimed ? (
                          <div className="bg-stone-900 text-white px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold tracking-widest inline-block">
                            {rew.code}
                          </div>
                        ) : (
                          <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Claimed
                          </div>
                        )}
                      </div>
                      {!rew.claimed && (
                        <Button 
                          variant="outline" 
                          className="text-[9px] font-bold uppercase tracking-widest h-8 px-3 rounded-lg border-stone-200"
                          onClick={() => claimReward(rew.id)}
                        >
                          Claim
                        </Button>
                      )}
                    </div>
                    {rew.claimed && (
                      <div className="absolute top-2 right-2 rotate-12 opacity-10">
                        <Award className="w-16 h-16 text-stone-900" />
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </div>

            {/* Karma History Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between px-2">
                <h2 className="text-[9px] font-bold uppercase tracking-[0.15em] text-stone-400 dark:text-stone-500">Karma History</h2>
                <div className="text-[9px] font-bold text-stone-500 dark:text-stone-400 bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 px-2 py-0.5 rounded">
                  Recent Activity
                </div>
              </div>
              <div className="bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-900 rounded-2xl overflow-hidden shadow-sm">
                {[
                  { id: 'k1', action: 'Wait Time Report', location: 'Blue Bottle Coffee', points: '+15', time: '2h ago' },
                  { id: 'k2', action: 'Verification Bonus', location: 'Main Post Office', points: '+5', time: '5h ago' },
                  { id: 'k3', action: 'Daily Streak', location: 'System', points: '+10', time: '1d ago' },
                ].map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-4 border-b border-stone-100 dark:border-stone-900 last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-stone-50 dark:bg-stone-900 rounded-lg flex items-center justify-center text-stone-400">
                        <Award className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-stone-900 dark:text-stone-100">{item.action}</p>
                        <p className="text-[9px] text-stone-500 dark:text-stone-400 font-medium">{item.location} • {item.time}</p>
                      </div>
                    </div>
                    <div className="text-emerald-600 dark:text-emerald-400 font-bold text-xs">{item.points}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Reporting History */}
            <div className="space-y-4">
              <h2 className="text-[9px] font-bold uppercase tracking-[0.15em] text-stone-400 dark:text-stone-500 px-2">Reporting History</h2>
              <div className="space-y-3">
                {userReports.length === 0 ? (
                  <div className="bg-stone-50 dark:bg-stone-900/50 border border-stone-200 dark:border-stone-800 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center gap-3 text-center">
                    <History className="w-8 h-8 text-stone-200 dark:text-stone-800" />
                    <p className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">No reports yet</p>
                  </div>
                ) : userReports.map((rep: any) => (
                  <Card key={rep.id} className="p-4 border-stone-200 dark:border-stone-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center border",
                          rep.status === 'No Wait' ? "bg-green-50 text-green-700 border-green-100 dark:bg-green-900/20 dark:text-green-400 dark:border-green-900/30" : 
                          rep.status === 'Moving Fast' ? "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-900/30" : 
                          "bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-900/30"
                        )}>
                          {rep.status === 'No Wait' ? <CheckCircle2 className="w-5 h-5" /> : 
                           rep.status === 'Moving Fast' ? <Zap className="w-5 h-5" /> : 
                           <AlertCircle className="w-5 h-5" />}
                        </div>
                        <div>
                          <div className="font-bold text-sm text-stone-900">{rep.locationName}</div>
                          <div className="text-[10px] text-stone-400 font-bold uppercase tracking-tight">
                            {rep.status} • {rep.waitTime}m • {format(rep.timestamp.toDate(), 'MMM d, h:mm a')}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold text-stone-900">+{rep.verifiedCount > 0 ? 5 + (rep.verifiedCount * 10) : 5}</div>
                        <div className="text-[8px] uppercase font-bold tracking-widest text-stone-400">Karma Earned</div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </motion.div>
        ) : isNotificationsOpen ? (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-8"
          >
            {/* Notifications Header */}
            <div className="flex items-center justify-between">
              <button 
                onClick={() => setIsNotificationsOpen(false)}
                className="flex items-center gap-2 text-sm font-bold text-stone-400 dark:text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Back to Dashboard
              </button>
              <div className="text-[9px] font-bold text-stone-500 dark:text-stone-400 bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 px-3 py-1 rounded uppercase tracking-widest">
                Alerts & Activity
              </div>
            </div>

            {/* Active Alerts */}
            <div className="space-y-4">
              <h2 className="text-[9px] font-bold uppercase tracking-[0.15em] text-stone-400 dark:text-stone-500 px-2">Watching Now</h2>
              <div className="space-y-3">
                {activeAlerts.length === 0 ? (
                  <div className="bg-stone-50 dark:bg-stone-900/50 border border-stone-200 dark:border-stone-800 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center gap-3 text-center">
                    <Bell className="w-8 h-8 text-stone-200 dark:text-stone-800" />
                    <p className="text-xs font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">No active alerts</p>
                    <p className="text-[10px] text-stone-400 dark:text-stone-500 max-w-[200px]">Set alerts on locations to get notified of wait time changes</p>
                  </div>
                ) : (
                  locations.filter(loc => activeAlerts.includes(loc.id)).map(loc => (
                    <Card key={loc.id} className="p-4 border-stone-200 dark:border-stone-800">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-stone-50 dark:bg-stone-800 rounded-lg flex items-center justify-center text-stone-400 dark:text-stone-500">
                            <Bell className="w-5 h-5 fill-current" />
                          </div>
                          <div>
                            <div className="font-bold text-sm text-stone-900 dark:text-stone-100">{loc.name}</div>
                            <div className="text-[10px] text-stone-400 font-bold uppercase tracking-tight">Alerting if wait &lt; 10m</div>
                          </div>
                        </div>
                        <Button 
                          variant="ghost" 
                          className="text-stone-400 hover:text-rose-600 p-2"
                          onClick={() => setActiveAlerts(prev => prev.filter(id => id !== loc.id))}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </div>

            {/* Recent Activity */}
            <div className="space-y-4">
              <h2 className="text-[9px] font-bold uppercase tracking-[0.15em] text-stone-400 dark:text-stone-500 px-2">Recent Activity</h2>
              <div className="space-y-3">
                {MOCK_NOTIFICATIONS.map(notif => (
                  <Card key={notif.id} className="p-4 border-stone-200 dark:border-stone-800">
                    <div className="flex items-start gap-4">
                      <div className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                        notif.type === 'reward' ? "bg-amber-50 text-amber-600 dark:bg-amber-900/20" :
                        notif.type === 'alert' ? "bg-rose-50 text-rose-600 dark:bg-rose-900/20" :
                        "bg-stone-50 text-stone-600 dark:bg-stone-800"
                      )}>
                        {notif.type === 'reward' ? <Award className="w-5 h-5" /> :
                         notif.type === 'alert' ? <AlertTriangle className="w-5 h-5" /> :
                         <Info className="w-5 h-5" />}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="font-bold text-sm text-stone-900 dark:text-stone-100">{notif.title}</div>
                          <span className="text-[8px] font-bold text-stone-400 uppercase tracking-widest">{notif.time}</span>
                        </div>
                        <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">{notif.description}</p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </motion.div>
        ) : !selectedLocation ? (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-6"
          >
            {/* Search and View Toggle */}
            <div className="flex items-center gap-4 relative z-50 group">
              <div className="relative flex-1">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-stone-300 w-4 h-4 group-focus-within:text-[#1A1A1A] dark:group-focus-within:text-[#E5E5E5] transition-colors" />
                <input 
                  type="text" 
                  placeholder="Search locations..." 
                  className="w-full pl-12 pr-12 py-4.5 bg-white/60 dark:bg-stone-900/60 backdrop-blur-md border border-stone-200/50 dark:border-stone-800/50 rounded-2xl shadow-soft focus:ring-4 focus:ring-stone-900/5 dark:focus:ring-stone-100/5 focus:border-[#1A1A1A] dark:focus:border-[#E5E5E5] outline-none transition-all text-sm font-medium placeholder:text-stone-300 text-[#1A1A1A] dark:text-[#E5E5E5]"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setIsSearchFocused(true)}
                  onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-5 top-1/2 -translate-y-1/2 p-1.5 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-full transition-all"
                  >
                    <X className="w-3.5 h-3.5 text-stone-300" />
                  </button>
                )}

                {/* Suggestions Dropdown */}
                <AnimatePresence>
                  {isSearchFocused && searchQuery.length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-stone-900 border border-zinc-200 dark:border-stone-800 rounded-2xl shadow-xl overflow-hidden max-h-64 overflow-y-auto z-[60]"
                    >
                      {filteredLocations.length > 0 ? (
                        <motion.div 
                          initial="hidden"
                          animate="visible"
                          variants={{
                            visible: { transition: { staggerChildren: 0.05 } }
                          }}
                        >
                          {filteredLocations.map((loc) => (
                            <motion.button
                              key={loc.id}
                              variants={{
                                hidden: { opacity: 0, x: -10 },
                                visible: { opacity: 1, x: 0 }
                              }}
                              onClick={() => {
                                setSelectedLocation(loc);
                                setSearchQuery('');
                                setIsSearchFocused(false);
                              }}
                              className="w-full p-4 flex items-center gap-4 hover:bg-zinc-50 dark:hover:bg-stone-800 transition-colors text-left border-b border-zinc-50 dark:border-stone-800 last:border-0"
                            >
                              <div className="w-10 h-10 bg-zinc-50 dark:bg-stone-800 rounded-lg flex items-center justify-center text-zinc-400 dark:text-stone-500">
                                {getCategoryIcon(loc.category)}
                              </div>
                              <div>
                                <h4 className="font-bold text-sm text-stone-900 dark:text-stone-100">{loc.name}</h4>
                                <p className="text-xs text-zinc-500 dark:text-stone-400">{loc.category} • {loc.address}</p>
                              </div>
                              <div className="ml-auto text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                {loc.currentWaitTime}m
                              </div>
                            </motion.button>
                          ))}
                        </motion.div>
                      ) : (
                        <div className="p-8 text-center space-y-2">
                          <AlertCircle className="w-8 h-8 text-zinc-300 dark:text-stone-700 mx-auto" />
                          <p className="text-sm text-zinc-500 dark:text-stone-400 font-medium">No locations found for "{searchQuery}"</p>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              
              <div className="flex bg-stone-100/50 dark:bg-stone-900/50 p-1.5 rounded-2xl border border-stone-200/50 dark:border-stone-800/50 shadow-inner-soft">
                <button 
                  onClick={() => setViewMode('list')}
                  className={cn(
                    "px-5 py-2.5 rounded-xl transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest",
                    viewMode === 'list' ? "bg-white dark:bg-stone-800 text-[#1A1A1A] dark:text-[#E5E5E5] shadow-premium" : "text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
                  )}
                >
                  <LayoutList className="w-4 h-4" />
                  List
                </button>
                <button 
                  onClick={() => setViewMode('map')}
                  className={cn(
                    "px-5 py-2.5 rounded-xl transition-all flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest",
                    viewMode === 'map' ? "bg-white dark:bg-stone-800 text-[#1A1A1A] dark:text-[#E5E5E5] shadow-premium" : "text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
                  )}
                >
                  <MapIcon className="w-4 h-4" />
                  Map
                </button>
              </div>
            </div>

            {/* Categories */}
            <div className="flex items-center justify-between gap-4 overflow-x-auto pb-2 scrollbar-hide px-1">
              <div className="flex gap-3">
                {['All', 'Bus', 'Train', 'Cafe', 'Restaurant', 'Hospital', 'Cinema', 'Government'].map((cat) => (
                  <button 
                    key={cat}
                    className={cn(
                      "px-5 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest whitespace-nowrap transition-all border",
                      searchQuery === cat ? "bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 border-stone-900 dark:border-stone-100 shadow-md" : "bg-white dark:bg-stone-900 text-stone-500 dark:text-stone-400 border-stone-200 dark:border-stone-800 hover:border-stone-400 dark:hover:border-stone-600"
                    )}
                    onClick={() => setSearchQuery(cat === 'All' ? '' : cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowOnlyOpen(!showOnlyOpen)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest border transition-all shrink-0",
                  showOnlyOpen ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800" : "bg-white dark:bg-stone-900 text-stone-500 border-stone-200 dark:border-stone-800"
                )}
              >
                <Clock className="w-3.5 h-3.5" />
                Open Now
              </button>
            </div>

            {viewMode === 'map' ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-between px-2">
                  <h2 className="text-[9px] font-bold uppercase tracking-[0.15em] text-stone-400">Interactive Map</h2>
                  <div className="text-[9px] font-bold text-stone-500 dark:text-stone-400 bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 px-2 py-0.5 rounded">
                    {filteredLocations.length} Locations Found
                  </div>
                </div>
                <MapView 
                  locations={filteredLocations} 
                  onSelectLocation={(loc) => {
                    setSelectedLocation(loc);
                    setViewMode('list');
                  }} 
                  darkMode={darkMode}
                />
              </motion.div>
            ) : (
              <>
                {/* Quick Stats */}
                <div className="grid grid-cols-2 gap-4">
                  <motion.div 
                    layout
                    whileHover={{ y: -1 }}
                    className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-5 shadow-sm relative overflow-hidden group"
                  >
                    <div className="relative z-10 space-y-1">
                      <div className="flex items-center gap-2 text-stone-500 dark:text-stone-400 text-[9px] uppercase font-bold tracking-widest">
                        <Zap className="w-3 h-3 text-stone-900 dark:text-stone-100" />
                        Accuracy
                      </div>
                      <div className="text-xl font-sans font-bold tracking-tight text-stone-900 dark:text-stone-100">98.4%</div>
                      <div className="text-[10px] font-medium text-stone-500 dark:text-stone-400 leading-tight">Live prediction confidence score</div>
                    </div>
                  </motion.div>
                  <motion.div 
                    layout
                    whileHover={{ y: -1 }}
                    className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-5 shadow-sm relative overflow-hidden group"
                  >
                    <div className="relative z-10 space-y-1">
                      <div className="flex items-center gap-2 text-stone-500 dark:text-stone-400 text-[9px] uppercase font-bold tracking-widest">
                        <History className="w-3 h-3 text-stone-900 dark:text-stone-100" />
                        Activity
                      </div>
                      <div className="text-xl font-sans font-bold tracking-tight text-stone-900 dark:text-stone-100">{locations.length * 12}+</div>
                      <div className="text-[10px] font-medium text-stone-500 dark:text-stone-400 leading-tight">Data points processed today</div>
                    </div>
                  </motion.div>
                </div>

                {/* Nearby Section */}
                <div className="space-y-5">
                  <div className="flex items-center justify-between px-3">
                    <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 dark:text-stone-500">Nearby Locations</h2>
                    <div className="text-[9px] font-bold text-stone-400 dark:text-stone-500 bg-stone-50/50 dark:bg-stone-900/50 border border-stone-100/50 dark:border-stone-800/50 px-3 py-1 rounded-full">
                      Within 2km
                    </div>
                  </div>
                  <div className="flex gap-5 overflow-x-auto pb-6 scrollbar-hide px-1">
                    {filteredLocations.slice(0, 3).map((loc) => (
                      <motion.div 
                        key={loc.id}
                        whileHover={{ y: -6, scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setSelectedLocation(loc)}
                        className="min-w-[220px] glass-card rounded-3xl p-5 cursor-pointer group"
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div className="w-11 h-11 bg-stone-50 dark:bg-stone-800/50 rounded-2xl flex items-center justify-center text-stone-400 group-hover:bg-stone-100 dark:group-hover:bg-stone-700 transition-all shadow-inner-soft">
                            {getCategoryIcon(loc.category)}
                          </div>
                          <div className={cn(
                            "px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest shadow-sm",
                            loc.currentWaitTime > 30 ? "bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400" : "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400"
                          )}>
                            {loc.currentWaitTime}m
                          </div>
                        </div>
                        <h3 className="font-serif font-medium text-base text-[#1A1A1A] dark:text-[#E5E5E5] truncate">{loc.name}</h3>
                        <p className="text-[10px] text-stone-400 dark:text-stone-500 font-medium uppercase tracking-widest mt-1.5 flex items-center gap-1.5">
                          <MapPin className="w-3 h-3" />
                          0.8 km away
                        </p>
                      </motion.div>
                    ))}
                  </div>
                             {/* Location List */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between px-3">
                    <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400">
                      {searchQuery ? 'Search Results' : 'Nearby Locations'}
                    </h2>
                    {!searchQuery && <div className="text-[9px] font-bold text-stone-400 dark:text-stone-500 bg-stone-50/50 dark:bg-stone-900/50 border border-stone-100/50 dark:border-stone-800/50 px-3 py-1 rounded-full">Real-time Feed</div>}
                  </div>
                  <motion.div 
                    layout
                    className="space-y-4"
                  >
                    <AnimatePresence mode="popLayout">
                      {filteredLocations.map((loc, index) => (
                        <motion.div
                          key={loc.id}
                          layout
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ delay: index * 0.03, type: "spring", stiffness: 100, damping: 20 }}
                          whileHover={{ y: -2 }}
                          whileTap={{ scale: 0.99 }}
                        >
                          <div className="glass-card rounded-3xl hover:border-stone-300 dark:hover:border-stone-600 transition-all cursor-pointer group overflow-hidden">
                            <div className="p-5 flex items-center justify-between relative group/card">
                              <div className="flex items-center gap-5 cursor-pointer flex-1" onClick={() => setSelectedLocation(loc)}>
                                <div className="w-12 h-12 bg-stone-50 dark:bg-stone-800/50 rounded-2xl flex items-center justify-center group-hover:bg-stone-100 dark:group-hover:bg-stone-700 transition-all text-stone-400 dark:text-stone-500 shadow-inner-soft border border-stone-100/50 dark:border-stone-700/50">
                                  {getCategoryIcon(loc.category)}
                                </div>
                                <div>
                                  <div className="flex items-center gap-3">
                                    <h3 className="font-serif font-medium text-lg text-[#1A1A1A] dark:text-[#E5E5E5] group-hover:text-black dark:group-hover:text-white transition-colors">{loc.name}</h3>
                                  </div>
                                  <div className="flex items-center gap-2.5 mt-1">
                                    <span className="text-[8px] font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500 bg-stone-50 dark:bg-stone-900 border border-stone-100 dark:border-stone-800 px-2 py-0.5 rounded-full">{loc.category}</span>
                                    <span className="text-[11px] text-stone-400 dark:text-stone-500 font-medium truncate max-w-[180px]">{loc.address}</span>
                                  </div>
                                  {loc.vibeTags && (
                                    <div className="flex flex-wrap gap-1.5 mt-3">
                                      {loc.vibeTags.map(tag => (
                                        <span key={tag} className="text-[7px] font-bold uppercase tracking-[0.15em] text-stone-400 dark:text-stone-500 border border-stone-200/50 dark:border-stone-800/50 px-2 py-1 rounded-full bg-white/30 dark:bg-black/30">
                                          {tag}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-5">
                                <motion.button 
                                  whileHover={{ scale: 1.2 }}
                                  whileTap={{ scale: 0.8 }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleFavorite(loc.id);
                                  }}
                                  className={cn(
                                    "p-2.5 rounded-full transition-all hover:bg-stone-50 dark:hover:bg-stone-800/50",
                                    favorites.includes(loc.id) ? "text-rose-500" : "text-stone-200 dark:text-stone-700"
                                  )}
                                >
                                  <Heart className={cn("w-4.5 h-4.5", favorites.includes(loc.id) && "fill-current")} />
                                </motion.button>
                                <div className="text-right flex flex-col items-end cursor-pointer" onClick={() => setSelectedLocation(loc)}>
                                  <motion.div 
                                    key={loc.currentWaitTime}
                                    initial={{ opacity: 0.5, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1, color: loc.currentWaitTime > 30 ? "#E11D48" : loc.currentWaitTime > 15 ? "#D97706" : "#059669" }}
                                    className="text-2xl font-serif font-medium tracking-tight"
                                  >
                                    {loc.currentWaitTime}m
                                  </motion.div>
                                  <div className="flex items-center gap-1.5 mt-1">
                                    <Users className="w-3 h-3 text-stone-300 dark:text-stone-600" />
                                    <span className="text-[9px] font-bold text-stone-300 dark:text-stone-600 uppercase tracking-widest">~{loc.approxPeopleCount}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </motion.div>
                </div>

                {/* Leaderboard Section */}
                <div className="space-y-5">
                  <div className="flex items-center justify-between px-3">
                    <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 dark:text-stone-500">Top Oracles</h2>
                    <div className="text-[9px] font-bold text-stone-400 dark:text-stone-500 bg-stone-50/50 dark:bg-stone-900/50 border border-stone-100/50 dark:border-stone-800/50 px-3 py-1 rounded-full">
                      Weekly Ranking
                    </div>
                  </div>
                  <div className="glass-card rounded-3xl overflow-hidden">
                    {MOCK_LEADERBOARD.map((entry, index) => (
                      <div 
                        key={entry.id} 
                        className={cn(
                          "flex items-center justify-between p-5 border-b border-stone-100/50 dark:border-stone-800/50 last:border-0 transition-colors",
                          entry.id === profile?.uid && "bg-stone-50/50 dark:bg-stone-800/30"
                        )}
                      >
                        <div className="flex items-center gap-5">
                          <div className={cn(
                            "w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shadow-sm",
                            index === 0 ? "bg-amber-100 text-amber-700" : 
                            index === 1 ? "bg-stone-200 text-stone-700" :
                            index === 2 ? "bg-orange-100 text-orange-700" : "bg-stone-50 text-stone-400"
                          )}>
                            {entry.rank}
                          </div>
                          <div className="w-10 h-10 bg-stone-50 dark:bg-stone-800/50 rounded-xl flex items-center justify-center text-stone-400 shadow-inner-soft">
                            <User className="w-4.5 h-4.5" />
                          </div>
                          <div>
                            <p className="text-sm font-serif font-medium text-[#1A1A1A] dark:text-[#E5E5E5]">{entry.displayName}</p>
                            <p className="text-[8px] font-bold text-stone-400 uppercase tracking-widest">{entry.status}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-serif font-medium text-[#1A1A1A] dark:text-[#E5E5E5]">{entry.karmaPoints}</p>
                          <p className="text-[8px] font-bold text-stone-400 uppercase tracking-widest">Karma</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Activity Feed Section */}
                <div className="space-y-5">
                  <div className="flex items-center justify-between px-3">
                    <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 dark:text-stone-500">Live Activity</h2>
                    <div className="flex items-center gap-2 bg-emerald-50/50 dark:bg-emerald-900/20 px-3 py-1 rounded-full border border-emerald-100/50 dark:border-emerald-800/50">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                      <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Live</span>
                    </div>
                  </div>
                  <div className="space-y-4">
                    {activities.map((activity) => (
                      <motion.div 
                        key={activity.id} 
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="glass-card rounded-2xl p-4 flex items-center gap-5 shadow-soft"
                      >
                        <div className="w-10 h-10 bg-stone-50 dark:bg-stone-800/50 rounded-xl flex items-center justify-center text-stone-400 shadow-inner-soft">
                          <Zap className="w-4.5 h-4.5" />
                        </div>
                        <div className="flex-1">
                          <p className="text-[11px] text-[#1A1A1A] dark:text-[#E5E5E5] leading-relaxed">
                            <span className="font-serif font-medium text-sm">{activity.userName}</span> {activity.status} at <span className="font-serif font-medium text-sm">{activity.locationName}</span>
                          </p>
                          <p className="text-[9px] text-stone-400 dark:text-stone-500 font-medium uppercase tracking-widest mt-1">
                            {format(activity.timestamp, 'h:mm a')}
                          </p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </motion.div>
      ) : (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            {/* Back Button */}
            <motion.button 
              whileHover={{ x: -4 }}
              onClick={() => setSelectedLocation(null)}
              className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-stone-400 hover:text-[#1A1A1A] transition-colors bg-stone-50/50 dark:bg-stone-900/50 px-4 py-2 rounded-full border border-stone-100/50 dark:border-stone-800/50 w-fit"
            >
              <ChevronRight className="rotate-180 w-3.5 h-3.5" />
              Back to Search
            </motion.button>

            {/* Location Detail Header */}
            <div className="flex items-start justify-between gap-8 pt-6">
              <div className="space-y-3 flex-1">
                <div className="flex items-center gap-4">
                  <h1 className="text-3xl font-serif font-medium tracking-tight text-[#1A1A1A] dark:text-[#E5E5E5] leading-tight">{selectedLocation.name}</h1>
                  <motion.button 
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => toggleFavorite(selectedLocation.id)}
                    className={cn(
                      "p-2.5 rounded-full transition-all hover:bg-stone-50 dark:hover:bg-stone-800/50 border border-stone-100/50 dark:border-stone-800/50",
                      favorites.includes(selectedLocation.id) ? "text-rose-500 bg-rose-50/50 dark:bg-rose-900/20" : "text-stone-300 dark:text-stone-700"
                    )}
                  >
                    <Heart className={cn("w-5 h-5", favorites.includes(selectedLocation.id) && "fill-current")} />
                  </motion.button>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-stone-500 dark:text-stone-400 bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider">
                    <MapPin className="w-3 h-3" /> {selectedLocation.address}
                  </div>
                  <div className="text-[9px] font-bold text-stone-500 dark:text-stone-400 bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 px-2 py-0.5 rounded uppercase tracking-wider">
                    {selectedLocation.category}
                  </div>
                </div>
                {selectedLocation.vibeTags && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {selectedLocation.vibeTags.map(tag => (
                      <span key={tag} className="text-[8px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400 bg-stone-50 dark:bg-stone-900/50 border border-stone-100 dark:border-stone-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Tag className="w-2.5 h-2.5" /> {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="w-14 h-14 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg flex items-center justify-center shadow-sm text-stone-400 dark:text-stone-500 shrink-0">
                {getCategoryIcon(selectedLocation.category)}
              </div>
            </div>

            {/* Wait Time Stats & History */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card rounded-3xl p-8 space-y-8"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 dark:text-stone-500">Live Status</h2>
                  <div className="flex items-center gap-2 bg-emerald-50/50 dark:bg-emerald-900/20 px-3 py-1 rounded-full border border-emerald-100/50 dark:border-emerald-800/50">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Live</span>
                  </div>
                </div>

                <div className="flex items-end justify-between gap-6">
                  <div className="space-y-2">
                    <div className={cn(
                      "text-6xl font-serif font-medium tracking-tighter",
                      selectedLocation.currentWaitTime > 30 ? "text-rose-600 dark:text-rose-400" : selectedLocation.currentWaitTime > 15 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
                    )}>
                      {selectedLocation.currentWaitTime}
                      <span className="text-2xl ml-1.5 opacity-50">m</span>
                    </div>
                    <p className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-[0.15em]">Current Wait Time</p>
                  </div>
                  <div className="text-right space-y-2">
                    <div className="text-2xl font-serif font-medium text-[#1A1A1A] dark:text-[#E5E5E5]">~{selectedLocation.approxPeopleCount}</div>
                    <p className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-[0.15em]">People in Line</p>
                  </div>
                </div>

                <div className="pt-8 border-t border-stone-100/50 dark:border-stone-800/50">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 dark:text-stone-500">Hourly History</h3>
                  </div>
                  <div className="flex items-end justify-between h-28 gap-3 px-1">
                    {selectedLocation.history?.map((h, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center gap-3 group">
                        <div className="relative w-full flex items-end justify-center h-20">
                          <motion.div 
                            initial={{ height: 0 }}
                            animate={{ height: `${(h.waitTime / 60) * 100}%` }}
                            className={cn(
                              "w-full max-w-[14px] rounded-full transition-all group-hover:opacity-80 shadow-sm",
                              h.waitTime > 30 ? "bg-rose-200 dark:bg-rose-900/40" : h.waitTime > 15 ? "bg-amber-200 dark:bg-amber-900/40" : "bg-emerald-200 dark:bg-emerald-900/40"
                            )}
                          />
                          <div className="absolute -top-8 opacity-0 group-hover:opacity-100 transition-all bg-[#1A1A1A] text-white text-[9px] font-bold px-2 py-1 rounded-lg pointer-events-none shadow-premium">
                            {h.waitTime}m
                          </div>
                        </div>
                        <span className="text-[8px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-tighter">{h.time}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>

              <div className="space-y-8">
                {/* AI Prediction Banner */}
                <AnimatePresence mode="wait">
                  {loadingPrediction ? (
                    <motion.div
                      key="loading"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 1.05 }}
                    >
                      <div className="glass-card rounded-3xl p-10 flex flex-col items-center justify-center gap-6">
                        <div className="relative">
                          <motion.div 
                            animate={{ rotate: 360 }}
                            transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
                            className="w-14 h-14 border-2 border-stone-100 dark:border-stone-800 border-t-[#1A1A1A] dark:border-t-[#E5E5E5] rounded-full"
                          />
                          <Zap className="absolute inset-0 m-auto w-4 h-4 text-[#1A1A1A] dark:text-[#E5E5E5] fill-current" />
                        </div>
                        <div className="text-center space-y-2">
                          <p className="text-sm font-serif font-medium text-[#1A1A1A] dark:text-[#E5E5E5]">Processing Analytics</p>
                          <p className="text-[9px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-[0.2em]">Running predictive models...</p>
                        </div>
                      </div>
                    </motion.div>
                  ) : prediction && (
                    <motion.div 
                      key="prediction"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                    >
                      <div className="glass-card rounded-3xl overflow-hidden shadow-premium">
                        <div className="p-8 flex items-start justify-between gap-8">
                          <div className="space-y-6 flex-1">
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                "px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-[0.2em] border",
                                prediction.recommendation === 'GO NOW' ? "bg-emerald-50/50 text-emerald-600 border-emerald-100/50 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/50" : "bg-rose-50/50 text-rose-600 border-rose-100/50 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800/50"
                              )}>
                                {prediction.recommendation}
                              </div>
                              <div className="text-[9px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                <Zap className="w-3.5 h-3.5" /> AI Recommendation
                              </div>
                            </div>
                            <p className="text-base font-serif italic text-stone-600 dark:text-stone-300 leading-relaxed max-w-lg">
                              "{prediction.reasoning}"
                            </p>
                            <div className="flex items-center gap-3 pt-2">
                              <div className="bg-stone-50/50 dark:bg-stone-900/50 border border-stone-100/50 dark:border-stone-800/50 px-4 py-2 rounded-2xl text-[10px] font-bold text-stone-600 dark:text-stone-400 uppercase tracking-widest">
                                Next Hour: {prediction.futureWaitTime}m
                              </div>
                              <div className="bg-stone-50/50 dark:bg-stone-900/50 border border-stone-100/50 dark:border-stone-800/50 px-4 py-2 rounded-2xl text-[10px] font-bold text-stone-600 dark:text-stone-400 uppercase tracking-widest">
                                Trend: {prediction.futureWaitTime < selectedLocation.currentWaitTime ? 'Improving' : 'Worsening'}
                              </div>
                              <motion.button 
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                className={cn(
                                  "h-9 px-5 rounded-2xl text-[10px] font-bold uppercase tracking-widest ml-auto transition-all border",
                                  activeAlerts.includes(selectedLocation.id) 
                                    ? "bg-[#1A1A1A] text-white border-[#1A1A1A] dark:bg-[#E5E5E5] dark:text-[#1A1A1A] dark:border-[#E5E5E5]" 
                                    : "bg-white/50 text-stone-600 border-stone-200/50 hover:border-stone-400 dark:bg-stone-900/50 dark:text-stone-400 dark:border-stone-800/50"
                                )}
                                onClick={() => {
                                  if (activeAlerts.includes(selectedLocation.id)) {
                                    setActiveAlerts(prev => prev.filter(id => id !== selectedLocation.id));
                                  } else {
                                    setActiveAlerts(prev => [...prev, selectedLocation.id]);
                                  }
                                }}
                              >
                                {activeAlerts.includes(selectedLocation.id) ? 'Alert Active' : 'Set Alert'}
                              </motion.button>
                            </div>
                          </div>
                          <div className="text-right shrink-0 flex flex-col items-end gap-3">
                            <div className="text-5xl font-serif font-medium tracking-tighter leading-none text-[#1A1A1A] dark:text-[#E5E5E5]">{selectedLocation.currentWaitTime}</div>
                            <div className="text-[9px] uppercase font-bold tracking-[0.2em] text-stone-400 dark:text-stone-500">Minutes Wait</div>
                            <div className="flex items-center gap-2 mt-2 bg-stone-50/50 dark:bg-stone-900/50 border border-stone-100/50 dark:border-stone-800/50 px-3 py-1.5 rounded-2xl">
                              <Users className="w-3.5 h-3.5 text-stone-400 dark:text-stone-500" />
                              <span className="text-[10px] font-bold text-stone-500 dark:text-stone-400 uppercase tracking-tight">{selectedLocation.approxPeopleCount}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Historical vs Current */}
            <div className="grid grid-cols-2 gap-6">
              <motion.div 
                whileHover={{ y: -4 }}
                className="glass-card rounded-3xl p-6 flex items-center gap-6 group transition-all shadow-soft"
              >
                <div className="w-12 h-12 bg-stone-50/50 dark:bg-stone-900/50 border border-stone-100/50 dark:border-stone-800/50 rounded-2xl flex items-center justify-center text-stone-400 dark:text-stone-500 group-hover:bg-[#1A1A1A] group-hover:text-white dark:group-hover:bg-[#E5E5E5] dark:group-hover:text-[#1A1A1A] transition-all">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-2xl font-serif font-medium tracking-tight text-[#1A1A1A] dark:text-[#E5E5E5]">{selectedLocation.historicalBaseline}m</div>
                  <div className="text-[9px] uppercase font-bold tracking-[0.2em] text-stone-400 dark:text-stone-500 mt-1">Historical Avg</div>
                </div>
              </motion.div>
              <motion.div 
                whileHover={{ y: -4 }}
                className="glass-card rounded-3xl p-6 flex items-center gap-6 group transition-all shadow-soft"
              >
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center border transition-all",
                  selectedLocation.currentWaitTime < selectedLocation.historicalBaseline 
                    ? "bg-emerald-50/50 text-emerald-600 border-emerald-100/50 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/50" 
                    : "bg-rose-50/50 text-rose-600 border-rose-100/50 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800/50"
                )}>
                  {selectedLocation.currentWaitTime < selectedLocation.historicalBaseline ? <TrendingDown className="w-5 h-5" /> : <TrendingUp className="w-5 h-5" />}
                </div>
                <div>
                  <div className="text-2xl font-serif font-medium tracking-tight text-[#1A1A1A] dark:text-[#E5E5E5]">
                    {Math.abs(selectedLocation.currentWaitTime - selectedLocation.historicalBaseline)}m
                  </div>
                  <div className="text-[9px] uppercase font-bold tracking-[0.2em] text-stone-400 dark:text-stone-500 mt-1">
                    {selectedLocation.currentWaitTime < selectedLocation.historicalBaseline ? 'Shorter' : 'Longer'}
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Crowdsourcing Actions */}
            <div className="space-y-6">
              <div className="flex items-center justify-between px-2">
                <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 dark:text-stone-500">Data Contribution</h2>
                <div className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-900/20 border border-emerald-100/50 dark:border-emerald-800/50 px-3 py-1 rounded-full">+5 Karma</div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {([
                  { label: 'No Wait', icon: CheckCircle2, value: 5, color: 'emerald' },
                  { label: 'Moving Fast', icon: Zap, value: 15, color: 'amber' },
                  { label: 'Stuck', icon: AlertCircle, value: 45, color: 'rose' }
                ] as const).map((action) => (
                  <motion.button 
                    key={action.label}
                    whileHover={{ y: -4, scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => { setIsReporting(true); submitReport(action.label, action.value); }}
                    className="glass-card p-6 rounded-3xl flex flex-col items-center gap-4 hover:border-[#1A1A1A] dark:hover:border-[#E5E5E5] transition-all group shadow-soft"
                  >
                    <div className="w-12 h-12 bg-stone-50/50 dark:bg-stone-900/50 border border-stone-100/50 dark:border-stone-800/50 text-stone-400 dark:text-stone-500 rounded-2xl flex items-center justify-center group-hover:bg-[#1A1A1A] group-hover:text-white dark:group-hover:bg-[#E5E5E5] dark:group-hover:text-[#1A1A1A] transition-all">
                      <action.icon className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400 group-hover:text-[#1A1A1A] dark:group-hover:text-[#E5E5E5] transition-colors">{action.label}</span>
                  </motion.button>
                ))}
              </div>

              <motion.button 
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => setIsProblemModalOpen(true)}
                className="w-full py-4 flex items-center justify-center gap-3 text-stone-400 dark:text-stone-500 hover:text-rose-500 transition-all text-[10px] font-bold uppercase tracking-[0.2em] border border-dashed border-stone-200 dark:border-stone-800 rounded-3xl hover:border-rose-200 dark:hover:border-rose-900/50 hover:bg-rose-50/30 dark:hover:bg-rose-900/10"
              >
                <Flag className="w-4 h-4" />
                Flag Data Inaccuracy
              </motion.button>
            </div>

            {/* Recent Reports */}
            <div className="space-y-6">
              <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 dark:text-stone-500 px-2">Recent User Reports</h2>
              <div className="space-y-4">
                {selectedLocation.reports?.map((report, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="glass-card p-6 rounded-3xl flex gap-6 group hover:shadow-premium transition-all"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-xs font-serif font-medium text-stone-500 shrink-0">
                      {report.userName.charAt(0)}
                    </div>
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-[#1A1A1A] dark:text-[#E5E5E5] uppercase tracking-[0.15em]">{report.userName}</span>
                        <div className="flex items-center gap-2 text-[9px] font-bold text-stone-400 uppercase tracking-widest">
                          <Clock className="w-3 h-3" />
                          {formatDistanceToNow(new Date(report.timestamp), { addSuffix: true })}
                        </div>
                      </div>
                      <p className="text-sm font-serif italic text-stone-600 dark:text-stone-300 leading-relaxed">"{report.comment}"</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
              <div className="space-y-3">
                {reports.length === 0 ? (
                   <div className="bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl p-8 flex flex-col items-center justify-center gap-3">
                     <History className="w-6 h-6 text-stone-200 dark:text-stone-600" />
                     <p className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-widest">No recent reports</p>
                   </div>
                ) : reports.map((rep) => (
                  <Card key={rep.id} className="p-4 border-stone-200 dark:border-stone-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          rep.status === 'No Wait' ? "bg-green-500" : rep.status === 'Moving Fast' ? "bg-amber-500" : "bg-rose-500"
                        )} />
                        <div>
                          <div className="font-bold text-xs text-stone-900 dark:text-stone-100">{rep.status} • {rep.waitTime}m</div>
                          <div className="text-[9px] text-stone-400 dark:text-stone-500 font-bold uppercase tracking-tight">
                            {format(rep.timestamp.toDate(), 'h:mm a')} • {rep.verifiedCount} verifications
                          </div>
                        </div>
                      </div>
                      <Button 
                        variant="outline" 
                        className="py-1 px-3 text-[9px] h-7 rounded-lg border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800"
                        disabled={rep.userId === user.uid || rep.verifiers.includes(user.uid)}
                        onClick={() => verifyReport(rep)}
                      >
                        {rep.verifiers.includes(user.uid) ? 'Verified' : 'Verify'}
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </motion.div>
          )}
        </main>

      {/* Quick Report Modal */}
      <AnimatePresence>
        {isQuickReportOpen && (
          <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsQuickReportOpen(false)}
              className="absolute inset-0 bg-stone-900/40 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, y: 100, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 100, scale: 0.95 }}
              className="relative w-full max-w-md glass-card rounded-[2.5rem] shadow-premium overflow-hidden border-stone-200/50 dark:border-stone-800/50"
            >
              <div className="p-8 space-y-8">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <h2 className="text-2xl font-serif font-medium tracking-tight text-[#1A1A1A] dark:text-[#E5E5E5]">Quick Report</h2>
                    <p className="text-[10px] text-stone-400 dark:text-stone-500 font-bold uppercase tracking-[0.2em]">Where are you right now?</p>
                  </div>
                  <motion.button 
                    whileHover={{ scale: 1.1, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setIsQuickReportOpen(false)}
                    className="w-10 h-10 flex items-center justify-center rounded-full bg-stone-50/50 dark:bg-stone-900/50 border border-stone-100/50 dark:border-stone-800/50 text-stone-400 hover:text-[#1A1A1A] transition-all"
                  >
                    <X className="w-5 h-5" />
                  </motion.button>
                </div>

                <div className="space-y-4 max-h-[45vh] overflow-y-auto pr-2 custom-scrollbar">
                  {locations.slice(0, 5).map(loc => (
                    <motion.button 
                      key={loc.id}
                      whileHover={{ x: 4 }}
                      onClick={() => {
                        setSelectedLocation(loc);
                        setIsQuickReportOpen(false);
                        setIsReporting(true);
                      }}
                      className="w-full flex items-center justify-between p-5 rounded-3xl border border-stone-100/50 dark:border-stone-800/50 hover:border-[#1A1A1A] dark:hover:border-[#E5E5E5] hover:bg-white/50 dark:hover:bg-stone-900/50 transition-all text-left group shadow-soft"
                    >
                      <div className="flex items-center gap-5">
                        <div className="w-12 h-12 bg-stone-50/50 dark:bg-stone-900/50 rounded-2xl flex items-center justify-center text-stone-400 dark:text-stone-500 group-hover:bg-[#1A1A1A] group-hover:text-white dark:group-hover:bg-[#E5E5E5] dark:group-hover:text-[#1A1A1A] transition-all">
                          {getCategoryIcon(loc.category)}
                        </div>
                        <div>
                          <div className="font-serif font-medium text-base text-[#1A1A1A] dark:text-[#E5E5E5]">{loc.name}</div>
                          <div className="text-[9px] text-stone-400 font-bold uppercase tracking-[0.15em] mt-1">{loc.address}</div>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-stone-300 group-hover:text-[#1A1A1A] dark:group-hover:text-[#E5E5E5] transition-colors" />
                    </motion.button>
                  ))}
                </div>

                <motion.button 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-5 rounded-3xl bg-[#1A1A1A] text-white dark:bg-[#E5E5E5] dark:text-[#1A1A1A] text-[10px] font-bold uppercase tracking-[0.25em] shadow-premium"
                  onClick={() => setIsQuickReportOpen(false)}
                >
                  Find Other Location
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Bottom Nav / Quick Actions */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/80 dark:bg-black/80 backdrop-blur-xl border-t border-stone-100/50 dark:border-stone-900/50 px-10 py-4 flex items-center justify-around z-50 shadow-premium">
        <button 
          onClick={() => {
            setSelectedLocation(null);
            setViewMode('list');
            setIsProfileOpen(false);
            setIsNotificationsOpen(false);
          }}
          className={cn(
            "p-3 rounded-2xl transition-all relative group", 
            (!selectedLocation && viewMode === 'list' && !isProfileOpen && !isNotificationsOpen) 
              ? "text-[#1A1A1A] dark:text-[#E5E5E5] bg-stone-50/50 dark:bg-stone-900/50 shadow-soft" 
              : "text-stone-400 dark:text-stone-500 hover:text-[#1A1A1A] dark:hover:text-[#E5E5E5]"
          )}
        >
          <Search className="w-5.5 h-5.5" />
          {(!selectedLocation && viewMode === 'list' && !isProfileOpen && !isNotificationsOpen) && (
            <motion.div layoutId="nav-active" className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-[#1A1A1A] dark:bg-[#E5E5E5] rounded-full" />
          )}
        </button>
        <button 
          onClick={() => {
            setSelectedLocation(null);
            setViewMode('map');
            setIsProfileOpen(false);
            setIsNotificationsOpen(false);
          }}
          className={cn(
            "p-3 rounded-2xl transition-all relative group", 
            (viewMode === 'map' && !selectedLocation && !isProfileOpen && !isNotificationsOpen) 
              ? "text-[#1A1A1A] dark:text-[#E5E5E5] bg-stone-50/50 dark:bg-stone-900/50 shadow-soft" 
              : "text-stone-400 dark:text-stone-500 hover:text-[#1A1A1A] dark:hover:text-[#E5E5E5]"
          )}
        >
          <MapPin className="w-5.5 h-5.5" />
          {(viewMode === 'map' && !selectedLocation && !isProfileOpen && !isNotificationsOpen) && (
            <motion.div layoutId="nav-active" className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-[#1A1A1A] dark:bg-[#E5E5E5] rounded-full" />
          )}
        </button>
        <div className="relative -top-8">
          <motion.button 
            whileHover={{ scale: 1.1, y: -4 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setIsQuickReportOpen(true)}
            className="w-16 h-16 bg-[#1A1A1A] dark:bg-[#E5E5E5] rounded-full flex items-center justify-center shadow-premium active:scale-90 transition-all border-4 border-white dark:border-black"
          >
            <Zap className="text-white dark:text-[#1A1A1A] w-7 h-7 fill-current" />
          </motion.button>
        </div>
        <button 
          onClick={() => {
            setIsNotificationsOpen(true);
            setIsProfileOpen(false);
            setSelectedLocation(null);
          }}
          className={cn(
            "p-3 rounded-2xl transition-all relative group", 
            isNotificationsOpen 
              ? "text-[#1A1A1A] dark:text-[#E5E5E5] bg-stone-50/50 dark:bg-stone-900/50 shadow-soft" 
              : "text-stone-400 dark:text-stone-500 hover:text-[#1A1A1A] dark:hover:text-[#E5E5E5]"
          )}
        >
          <Bell className="w-5.5 h-5.5" />
          {isNotificationsOpen && (
            <motion.div layoutId="nav-active" className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-[#1A1A1A] dark:bg-[#E5E5E5] rounded-full" />
          )}
        </button>
        <button 
          onClick={() => {
            setIsProfileOpen(true);
            setIsNotificationsOpen(false);
            setSelectedLocation(null);
          }}
          className={cn(
            "p-3 rounded-2xl transition-all relative group", 
            (isProfileOpen && !isNotificationsOpen) 
              ? "text-[#1A1A1A] dark:text-[#E5E5E5] bg-stone-50/50 dark:bg-stone-900/50 shadow-soft" 
              : "text-stone-400 dark:text-stone-500 hover:text-[#1A1A1A] dark:hover:text-[#E5E5E5]"
          )}
        >
          <User className="w-5.5 h-5.5" />
          {(isProfileOpen && !isNotificationsOpen) && (
            <motion.div layoutId="nav-active" className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-[#1A1A1A] dark:bg-[#E5E5E5] rounded-full" />
          )}
        </button>
      </nav>
      {/* Problem Report Modal */}
      <AnimatePresence>
        {isProblemModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsProblemModalOpen(false)}
              className="absolute inset-0 bg-stone-900/40 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md glass-card rounded-[2.5rem] shadow-premium overflow-hidden border-stone-200/50 dark:border-stone-800/50"
            >
              <div className="p-10 space-y-8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-5">
                    <div className="w-12 h-12 bg-stone-50/50 dark:bg-stone-900/50 border border-stone-100/50 dark:border-stone-800/50 rounded-2xl flex items-center justify-center text-stone-400 dark:text-stone-500">
                      <Flag className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-serif font-medium text-2xl text-[#1A1A1A] dark:text-[#E5E5E5] tracking-tight">Report a Problem</h3>
                      <p className="text-[10px] text-stone-400 dark:text-stone-500 font-bold uppercase tracking-[0.2em] mt-1">Help us keep data accurate</p>
                    </div>
                  </div>
                  <motion.button 
                    whileHover={{ scale: 1.1, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setIsProblemModalOpen(false)}
                    className="w-10 h-10 flex items-center justify-center rounded-full bg-stone-50/50 dark:bg-stone-900/50 border border-stone-100/50 dark:border-stone-800/50 text-stone-400 hover:text-[#1A1A1A] transition-all"
                  >
                    <X className="w-5 h-5" />
                  </motion.button>
                </div>

                <div className="space-y-6">
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 dark:text-stone-500 ml-1">Problem Type</label>
                    <div className="grid grid-cols-2 gap-3">
                      {['Incorrect Wait Time', 'Closed', 'Wrong Address', 'Other'].map((type) => (
                        <motion.button
                          key={type}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setProblemType(type as any)}
                          className={cn(
                            "px-5 py-3.5 rounded-2xl text-[10px] font-bold uppercase tracking-[0.15em] transition-all border shadow-soft",
                            problemType === type 
                              ? "bg-[#1A1A1A] dark:bg-[#E5E5E5] text-white dark:text-[#1A1A1A] border-[#1A1A1A] dark:border-[#E5E5E5]" 
                              : "bg-white/50 dark:bg-stone-900/50 text-stone-500 dark:text-stone-400 border-stone-100/50 dark:border-stone-800/50 hover:border-stone-300 dark:hover:border-stone-600"
                          )}
                        >
                          {type}
                        </motion.button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 dark:text-stone-500 ml-1">Description (Optional)</label>
                    <textarea 
                      value={problemDescription}
                      onChange={(e) => setProblemDescription(e.target.value)}
                      placeholder="Tell us more about the issue..."
                      className="w-full h-32 bg-stone-50/50 dark:bg-stone-900/50 border border-stone-100/50 dark:border-stone-800/50 rounded-2xl p-4 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-[#1A1A1A] dark:focus:ring-[#E5E5E5] transition-all shadow-inner resize-none text-[#1A1A1A] dark:text-[#E5E5E5]"
                    />
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex-1 rounded-3xl py-4 text-[10px] font-bold uppercase tracking-[0.2em] border border-stone-200 dark:border-stone-800 text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-900 transition-all"
                    onClick={() => setIsProblemModalOpen(false)}
                  >
                    Cancel
                  </motion.button>
                  <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex-[2] rounded-3xl py-4 text-[10px] font-bold uppercase tracking-[0.2em] bg-[#1A1A1A] dark:bg-[#E5E5E5] text-white dark:text-[#1A1A1A] shadow-premium disabled:opacity-50"
                    onClick={handleReportProblem}
                    disabled={isSubmittingProblem}
                  >
                    {isSubmittingProblem ? 'Submitting...' : 'Submit Report'}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
