import { reactive } from 'vue';

export type ModalName =
  | 'building'
  | 'research'
  | 'raid'
  | 'gathering'
  | 'monster'
  | 'brigand'
  | 'campaign'
  | 'hero'
  | 'titan'
  | 'tower'
  | 'dungeon'
  | 'expeditions'
  | 'mail'
  | 'guildVersus'
  | 'questDetail'
  | 'eventDetail'
  | 'battlePass'
  | 'guildChat'
  | 'log'
  | 'chest'
  | 'frontier'
  | 'marchDetail'
  | 'legendsDraft'
  | 'arena'
  | 'pvpOptimizer';

const modalState = reactive<Record<ModalName, boolean>>({
  building: false,
  research: false,
  raid: false,
  gathering: false,
  monster: false,
  brigand: false,
  campaign: false,
  hero: false,
  titan: false,
  tower: false,
  dungeon: false,
  expeditions: false,
  mail: false,
  guildVersus: false,
  questDetail: false,
  eventDetail: false,
  battlePass: false,
  guildChat: false,
  log: false,
  chest: false,
  frontier: false,
  marchDetail: false,
  legendsDraft: false,
  arena: false,
  pvpOptimizer: false,
});

const modalContext = reactive<{
  selectedHero?: any;
  selectedTitan?: any;
  selectedTitanId?: number | string | null;
  selectedQuestFilter?: string;
  selectedEventId?: number | string | null;
  selectedBattlePassId?: number | string | null;
  selectedCampaignGearId?: number | string | null;
  selectedCampaignHeroId?: number | string | null;
  selectedChestId?: number | string | null;
  selectedChestCategory?: string | null;
  campaignFarmMode?: 'gear' | 'hero' | 'soul';
  selectedMarchId?: string | number | null;
}>({});

const modalStack = reactive<string[]>([]);

export function registerModalOpen(name: string) {
  if (!name) return;
  const idx = modalStack.indexOf(name);
  if (idx !== -1) {
    modalStack.splice(idx, 1);
  }
  modalStack.push(name);
}

export function registerModalClose(name: string) {
  if (!name) return;
  const idx = modalStack.indexOf(name);
  if (idx !== -1) {
    modalStack.splice(idx, 1);
  }
}

export function isTopModal(name: string): boolean {
  if (!name || modalStack.length === 0) return true;
  return modalStack[modalStack.length - 1] === name;
}

export function getModalStackLevel(name: string, baseZ = 50): number {
  if (!name) return baseZ;
  const idx = modalStack.indexOf(name);
  if (idx <= 0) return baseZ;
  return baseZ + idx * 10;
}

export function getActiveModalStack(): string[] {
  return [...modalStack];
}

export function useModals() {
  function openModal(name: ModalName, context?: {
    selectedHero?: any;
    selectedTitan?: any;
    selectedTitanId?: number | string | null;
    selectedQuestFilter?: string;
    selectedEventId?: number | string | null;
    selectedBattlePassId?: number | string | null;
    selectedCampaignGearId?: number | string | null;
    selectedCampaignHeroId?: number | string | null;
    selectedCampaignSoulHeroId?: number | string | null;
    selectedChestId?: number | string | null;
    selectedChestCategory?: string | null;
    campaignFarmMode?: 'gear' | 'hero' | 'soul';
    selectedMarchId?: string | number | null;
  }) {
    if (context) {
      if (context.selectedHero !== undefined) modalContext.selectedHero = context.selectedHero;
      if (context.selectedTitan !== undefined) modalContext.selectedTitan = context.selectedTitan;
      if (context.selectedTitanId !== undefined) modalContext.selectedTitanId = context.selectedTitanId;
      if (context.selectedQuestFilter !== undefined) modalContext.selectedQuestFilter = context.selectedQuestFilter;
      if (context.selectedEventId !== undefined) modalContext.selectedEventId = context.selectedEventId;
      if (context.selectedBattlePassId !== undefined) modalContext.selectedBattlePassId = context.selectedBattlePassId;
      if (context.selectedCampaignGearId !== undefined) modalContext.selectedCampaignGearId = context.selectedCampaignGearId;
      if (context.selectedCampaignHeroId !== undefined) modalContext.selectedCampaignHeroId = context.selectedCampaignHeroId;
      if (context.selectedCampaignSoulHeroId !== undefined) {
        modalContext.selectedCampaignHeroId = context.selectedCampaignSoulHeroId;
        modalContext.campaignFarmMode = 'soul';
      }
      if (context.selectedChestId !== undefined) modalContext.selectedChestId = context.selectedChestId;
      if (context.selectedChestCategory !== undefined) modalContext.selectedChestCategory = context.selectedChestCategory;
      if (context.campaignFarmMode !== undefined) modalContext.campaignFarmMode = context.campaignFarmMode;
      if (context.selectedMarchId !== undefined) modalContext.selectedMarchId = context.selectedMarchId;
    }
    registerModalOpen(name);
    modalState[name] = true;
  }

  function closeModal(name: ModalName) {
    registerModalClose(name);
    modalState[name] = false;
  }

  function toggleModal(name: ModalName) {
    if (modalState[name]) {
      closeModal(name);
    } else {
      openModal(name);
    }
  }

  return {
    modalState,
    modalContext,
    modalStack,
    openModal,
    closeModal,
    toggleModal,
    registerModalOpen,
    registerModalClose,
    isTopModal,
    getModalStackLevel,
  };
}
