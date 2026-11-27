<script setup lang="ts">
import { ref } from 'vue';
import Header from '@/src/components/common/Header.vue';
import TabNav from '@/src/components/common/TabNav.vue';
import FabDial from '@/src/components/common/FabDial.vue';
import DashboardTab from '@/src/components/dashboard/DashboardTab.vue';
import HeroesTab from '@/src/components/tabs/HeroesTab.vue';
import TitansTab from '@/src/components/tabs/TitansTab.vue';
import ItemsTab from '@/src/components/tabs/ItemsTab.vue';
import ResourcesTab from '@/src/components/tabs/ResourcesTab.vue';
import TeamsTab from '@/src/components/tabs/TeamsTab.vue';
import GuildTab from '@/src/components/tabs/GuildTab.vue';
import EventsTab from '@/src/components/tabs/EventsTab.vue';
import GoalsTab from '@/src/components/tabs/GoalsTab.vue';
import QuestsTab from '@/src/components/tabs/QuestsTab.vue';
import SettingsTab from '@/src/components/tabs/SettingsTab.vue';
import ExpeditionsModal from '@/src/components/dialogs/ExpeditionsModal.vue';
import MailModal from '@/src/components/dialogs/MailModal.vue';
import LogModal from '@/src/components/dialogs/LogModal.vue';

import { useModals } from '@/src/composables/useModals';
import BuildingModal from '@/src/components/dialogs/BuildingModal.vue';
import ResearchModal from '@/src/components/dialogs/ResearchModal.vue';
import RaidModal from '@/src/components/dialogs/RaidModal.vue';
import GatheringModal from '@/src/components/dialogs/GatheringModal.vue';
import MonsterModal from '@/src/components/dialogs/MonsterModal.vue';
import BrigandCampModal from '@/src/components/dialogs/BrigandCampModal.vue';
import CampaignRaidModal from '@/src/components/dialogs/CampaignRaidModal.vue';
import HeroDetailModal from '@/src/components/dialogs/HeroDetailModal.vue';
import TowerModal from '@/src/components/dialogs/TowerModal.vue';
import DungeonModal from '@/src/components/dialogs/DungeonModal.vue';
import QuestDetailModal from '@/src/components/dialogs/QuestDetailModal.vue';
import EventDetailModal from '@/src/components/dialogs/EventDetailModal.vue';
import BattlePassModal from '@/src/components/dialogs/BattlePassModal.vue';
import GuildVersusModal from '@/src/components/dialogs/GuildVersusModal.vue';
import GuildChatPanel from '@/src/components/common/GuildChatPanel.vue';
import ChestModal from '@/src/components/dialogs/ChestModal.vue';
import FrontierModal from '@/src/components/dialogs/FrontierModal.vue';
import MarchDetailModal from '@/src/components/dialogs/MarchDetailModal.vue';
import LegendsDraftModal from '@/src/components/dialogs/LegendsDraftModal.vue';
import ArenaModal from '@/src/components/dialogs/ArenaModal.vue';
import GrandArenaModal from '@/src/components/dialogs/GrandArenaModal.vue';
import PvpTeamOptimizerModal from '@/src/components/dialogs/PvpTeamOptimizerModal.vue';
import HydraModal from '@/src/components/dialogs/HydraModal.vue';
import CommandPaletteModal from '@/src/components/common/CommandPaletteModal.vue';

const activeTab = ref('dashboard');
const { modalState, modalContext } = useModals();
</script>

<template>
  <div class="relative w-full min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-sans transition-colors antialiased flex flex-col items-center">
    <div class="w-full max-w-7xl 2xl:max-w-screen-2xl min-h-screen p-2.5 sm:p-4 md:p-5 flex flex-col gap-3 flex-1 min-h-0">
      <!-- Top Header -->
      <Header />

      <!-- Navigation Tabs -->
      <TabNav v-model="activeTab" />

      <!-- Tab Content -->
      <main class="flex-1 min-h-0 pb-12">
        <KeepAlive>
          <component
            :is="
              activeTab === 'dashboard' ? DashboardTab :
              activeTab === 'heroes' ? HeroesTab :
              activeTab === 'titans' ? TitansTab :
              activeTab === 'items' ? ItemsTab :
              activeTab === 'resources' ? ResourcesTab :
              activeTab === 'teams' ? TeamsTab :
              activeTab === 'guild' ? GuildTab :
              activeTab === 'events' ? EventsTab :
              activeTab === 'goals' ? GoalsTab :
              activeTab === 'settings' ? SettingsTab :
              DashboardTab
            "
          />
        </KeepAlive>
      </main>

      <!-- Floating Action Button (FAB) Dial -->
      <FabDial />

      <!-- Global Modals -->
      <BuildingModal v-model="modalState.building" />
      <ResearchModal v-model="modalState.research" />
      <RaidModal v-model="modalState.raid" />
      <GatheringModal v-model="modalState.gathering" />
      <MonsterModal v-model="modalState.monster" />
      <BrigandCampModal v-model="modalState.brigand" />
      <CampaignRaidModal v-model="modalState.campaign" />
      <HeroDetailModal v-model="modalState.hero" :hero="modalContext.selectedHero" />
      <TowerModal v-model="modalState.tower" />
      <DungeonModal v-model="modalState.dungeon" />
      <ExpeditionsModal v-model="modalState.expeditions" />
      <MailModal v-model="modalState.mail" />
      <QuestDetailModal v-model="modalState.questDetail" :initial-filter="modalContext.selectedQuestFilter" />
      <EventDetailModal v-model="modalState.eventDetail" :initial-event-id="modalContext.selectedEventId" />
      <BattlePassModal v-model="modalState.battlePass" :initial-pass-id="modalContext.selectedBattlePassId" />
      <GuildVersusModal v-model="modalState.guildVersus" />
      <GuildChatPanel v-model="modalState.guildChat" />
      <LogModal v-model="modalState.log" />
      <ChestModal
        v-model="modalState.chest"
        :initial-chest-id="modalContext.selectedChestId"
        :initial-category="modalContext.selectedChestCategory"
      />
      <FrontierModal v-model="modalState.frontier" />
      <MarchDetailModal
        v-model="modalState.marchDetail"
        :initial-march-id="modalContext.selectedMarchId"
      />
      <LegendsDraftModal v-model="modalState.legendsDraft" />
      <ArenaModal v-model="modalState.arena" />
      <GrandArenaModal v-model="modalState.grandArena" />
      <PvpTeamOptimizerModal v-model="modalState.pvpOptimizer" />
      <HydraModal v-model="modalState.hydra" />
      <CommandPaletteModal v-model="modalState.commandPalette" @select-tab="activeTab = $event" />
    </div>
  </div>
</template>
