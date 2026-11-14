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
  | 'tower'
  | 'dungeon'
  | 'expeditions'
  | 'draft'
  | 'guildVersus'
  | 'questDetail'
  | 'guildChat'
  | 'log';

const modalState = reactive<Record<ModalName, boolean>>({
  building: false,
  research: false,
  raid: false,
  gathering: false,
  monster: false,
  brigand: false,
  campaign: false,
  hero: false,
  tower: false,
  dungeon: false,
  expeditions: false,
  draft: false,
  guildVersus: false,
  questDetail: false,
  guildChat: false,
  log: false,
});

const modalContext = reactive<{
  selectedHero?: any;
  selectedQuestFilter?: string;
  selectedCampaignGearId?: number | string | null;
}>({});

export function useModals() {
  function openModal(name: ModalName, context?: {
    selectedHero?: any;
    selectedQuestFilter?: string;
    selectedCampaignGearId?: number | string | null;
  }) {
    if (context) {
      if (context.selectedHero !== undefined) modalContext.selectedHero = context.selectedHero;
      if (context.selectedQuestFilter !== undefined) modalContext.selectedQuestFilter = context.selectedQuestFilter;
      if (context.selectedCampaignGearId !== undefined) modalContext.selectedCampaignGearId = context.selectedCampaignGearId;
    }
    modalState[name] = true;
  }

  function closeModal(name: ModalName) {
    modalState[name] = false;
  }

  function toggleModal(name: ModalName) {
    modalState[name] = !modalState[name];
  }

  return {
    modalState,
    modalContext,
    openModal,
    closeModal,
    toggleModal,
  };
}
