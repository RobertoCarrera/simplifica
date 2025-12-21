export interface TourStep {
  id: string;
  title: string;
  content: string;
  targetElement: string; // CSS selector
  position: 'top' | 'bottom' | 'left' | 'right' | 'center';
  showNext: boolean;
  showPrev: boolean;
  showSkip: boolean;
  action?: {
    type: 'click' | 'hover' | 'focus' | 'scroll';
    element?: string;
  };
  conditions?: {
    url?: string;
    element?: string;
    userRole?: string[];
  };
}

export interface Tour {
  id: string;
  name: string;
  description: string;
  category: 'first_time' | 'feature' | 'advanced' | 'troubleshooting';
  targetAudience: string[];
  estimatedTime: number; // minutos
  steps: TourStep[];
  prerequisites?: string[];
  icon: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  tags: string[];
  isActive: boolean;
  completionRate?: number;
}

export interface TooltipConfig {
  id: string;
  selector: string;
  title: string;
  content: string;
  position: 'top' | 'bottom' | 'left' | 'right';
  trigger: 'hover' | 'click' | 'focus' | 'manual';
  delay: number;
  context: {
    page?: string;
    userRole?: string[];
    feature?: string;
    condition?: string;
  };
  priority: number;
  isActive: boolean;
  showOnce?: boolean;
  dismissible: boolean;
}

export interface HelpArticle {
  id: string;
  title: string;
  content: string;
  excerpt: string;
  category: string;
  subcategory?: string;
  tags: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedReadTime: number; // minutos
  lastUpdated: Date;
  author: string;
  viewCount: number;
  rating: number;
  isPublished: boolean;
  relatedArticles: string[];
  attachments?: {
    type: 'image' | 'video' | 'document';
    url: string;
    title: string;
  }[];
}

export interface VideoTutorial {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  videoUrl: string;
  duration: number; // segundos
  category: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  tags: string[];
  transcript?: string;
  chapters?: {
    time: number;
    title: string;
    description?: string;
  }[];
  relatedArticles: string[];
  isPublished: boolean;
  viewCount: number;
  rating: number;
}

export interface UserProgress {
  userId: string;
  completedTours: string[];
  skippedTours: string[];
  viewedArticles: string[];
  watchedVideos: string[];
  tooltipsShown: string[];
  lastActivity: Date;
  preferences: {
    showTooltips: boolean;
    autoStartTours: boolean;
    preferredDifficulty: 'beginner' | 'intermediate' | 'advanced';
  };
}

export interface SearchResult {
  id: string;
  title: string;
  type: 'article' | 'video' | 'tour';
  relevanceScore: number;
  excerpt: string;
  category: string;
  url: string;
}

export interface HelpContext {
  currentPage: string;
  userRole: string;
  feature?: string;
  element?: string;
  userLevel: 'beginner' | 'intermediate' | 'advanced';
}

export interface OnboardingStats {
  totalUsers: number;
  completedOnboarding: number;
  completionRate: number;
  averageCompletionTime: number;
  mostSkippedSteps: string[];
  mostHelpfulArticles: string[];
  searchQueries: {
    query: string;
    count: number;
    successRate: number;
  }[];
}
