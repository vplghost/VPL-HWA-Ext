export interface DailyQuestItem {
  id: number;
  state: number;
  progress: number;
  reward?: Record<string, any>;
  [key: string]: any;
}

export interface SpecialQuestGroup {
  id?: number | string;
  localeKey?: string;
  hide?: boolean;
  repeatType?: string;
  quests?: any[];
  inactiveQuestIds?: (number | string)[];
  [key: string]: any;
}

export interface SpecialQuestEvent {
  id: number | string;
  viewId: number;
  start: number;
  end: number;
  groups: SpecialQuestGroup[];
  clientData?: {
    hideInSpecialQuestPopup?: boolean;
    [key: string]: any;
  };
  [key: string]: any;
}

export interface LocaleTitleInfo {
  title: string;
  category: 'Resources' | 'Activities' | string;
  unit: string;
  amount: number;
}

export interface DailyQuestDefinition {
  chainId: number;
  phase: number;
  transferProgress: boolean;
  condition: {
    args: Record<string, any>;
    name: string;
    target: number;
  };
  translationMethod: string;
  localeKey: string;
  template: string;
  label: string;
}
