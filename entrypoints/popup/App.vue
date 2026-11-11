<script setup lang="ts">
import { ref } from 'vue';
import Header from '@/src/components/common/Header.vue';
import TabNav from '@/src/components/common/TabNav.vue';
import DashboardTab from '@/src/components/dashboard/DashboardTab.vue';
import HeroesTab from '@/src/components/tabs/HeroesTab.vue';
import TitansTab from '@/src/components/tabs/TitansTab.vue';
import ItemsTab from '@/src/components/tabs/ItemsTab.vue';
import GatheringTab from '@/src/components/tabs/GatheringTab.vue';
import DungeonTab from '@/src/components/tabs/DungeonTab.vue';
import TowerTab from '@/src/components/tabs/TowerTab.vue';
import QuestsTab from '@/src/components/tabs/QuestsTab.vue';
import SettingsTab from '@/src/components/tabs/SettingsTab.vue';
import LogTab from '@/src/components/tabs/LogTab.vue';

const activeTab = ref('dashboard');
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
            activeTab === 'gathering' ? GatheringTab :
            activeTab === 'dungeon' ? DungeonTab :
            activeTab === 'tower' ? TowerTab :
            activeTab === 'quests' ? QuestsTab :
            activeTab === 'settings' ? SettingsTab :
            LogTab
          "
        />
      </KeepAlive>
    </main>
  </div>
</template>
