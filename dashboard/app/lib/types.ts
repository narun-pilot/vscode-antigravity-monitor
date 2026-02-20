
export interface DailyUsage {
  [date: string]: {
    [model: string]: number;
  };
}

export interface TokenQueryStats {
  [date: string]: {
    inputTokens: number;
    outputTokens: number;
    queries: {
      [queryType: string]: number;
    };
  };
}

export interface ProjectStats {
  [branch: string]: {
    inputTokens: number;
    outputTokens: number;
    queries: {
      [queryType: string]: number;
    };
  };
}

export interface UserData {
  userId: string;
  email: string;
  avatarUrl?: string;
  usage: DailyUsage;
  tokenQuery: TokenQueryStats;
  projects: ProjectStats;
}
