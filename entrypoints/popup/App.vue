<script setup lang="ts">
import { ref } from 'vue';
import Header from '@/src/components/common/Header.vue';
import TabNav from '@/src/components/common/TabNav.vue';
import DashboardTab from '@/src/components/dashboard/DashboardTab.vue';
import HeroesTab from '@/src/components/tabs/HeroesTab.vue';
import TitansTab from '@/src/components/tabs/TitansTab.vue';
import ItemsTab from '@/src/components/tabs/ItemsTab.vue';
import ResourcesTab from '@/src/components/tabs/ResourcesTab.vue';
import TeamsTab from '@/src/components/tabs/TeamsTab.vue';
import QuestsTab from '@/src/components/tabs/QuestsTab.vue';
import SettingsTab from '@/src/components/tabs/SettingsTab.vue';
import LogTab from '@/src/components/tabs/LogTab.vue';

import { useModals } from '@/src/composables/useModals';
import BuildingModal from '@/src/components/dialogs/BuildingModal.vue';
import ResearchModal from '@/src/components/dialogs/ResearchModal.vue';
import RaidModal from '@/src/components/dialogs/RaidModal.vue';
import MonsterModal from '@/src/components/dialogs/MonsterModal.vue';
import CampaignRaidModal from '@/src/components/dialogs/CampaignRaidModal.vue';
import HeroDetailModal from '@/src/components/dialogs/HeroDetailModal.vue';

const activeTab = ref('dashboard');
const { modalState, modalContext } = useModals();
</script>

<template>
  <div class="w-[780px] min-h-[600px] max-h-[640px] overflow-y-auto bg-slate-50 dark:bg-slate-950 p-3 text-slate-800 dark:text-slate-100 flex flex-col gap-3 font-sans transition-colors antialiased">
    <!-- Top Header -->
    <Header />

    <!-- Navigation Tabs -->
    <TabNav v-model="activeTab" />

    <!-- Tab Content -->
    <main class="flex-1 min-h-0">
      <KeepAlive>
        <component
          :is="
            activeTab === 'dashboard' ? DashboardTab :
            activeTab === 'heroes' ? HeroesTab :
            activeTab === 'titans' ? TitansTab :
            activeTab === 'items' ? ItemsTab :
            activeTab === 'resources' ? ResourcesTab :
            activeTab === 'teams' ? TeamsTab :
            activeTab === 'events' ? QuestsTab :
            activeTab === 'goals' ? QuestsTab :
            activeTab === 'settings' ? SettingsTab :
            LogTab
          "
        />
      </KeepAlive>
    </main>

    <!-- Global Modals -->
    <BuildingModal v-model="modalState.building" />
    <ResearchModal v-model="modalState.research" />
    <RaidModal v-model="modalState.raid" />
    <MonsterModal v-model="modalState.monster" />
    <CampaignRaidModal v-model="modalState.campaign" />
    <HeroDetailModal v-model="modalState.hero" :hero="modalContext.selectedHero" />
  </div>
</template>
