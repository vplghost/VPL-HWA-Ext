import { ref, onMounted, onUnmounted } from 'vue';

export function useHoverCardPosition() {
  const isVisible = ref(false);
  const cardPositionStyle = ref<Record<string, string>>({});
  const anchorRef = ref<HTMLElement | null>(null);
  let triggerEl: HTMLElement | null = null;

  function updatePosition() {
    if (!triggerEl || typeof window === 'undefined') return;
    const rect = triggerEl.getBoundingClientRect();
    const cardWidth = 304; // 19rem standard card width
    const winW = window.innerWidth;
    const winH = window.innerHeight;

    // 1. Horizontal: clamp so card is completely within viewport [8px, winW - 8px]
    let left = rect.left;
    if (rect.left + cardWidth + 12 > winW) {
      left = Math.max(8, Math.min(winW - cardWidth - 12, rect.right - cardWidth));
    }
    left = Math.max(8, left);

    // 2. Vertical: Check available space above and below
    const spaceBelow = winH - rect.bottom;
    const spaceAbove = rect.top;
    const styleObj: Record<string, string> = {
      position: 'fixed',
      left: `${Math.round(left)}px`,
      zIndex: '99999',
    };

    // If space below is less than 340px and space above has more space, flip ABOVE the trigger!
    if (spaceBelow < 340 && spaceAbove > spaceBelow) {
      const maxHeight = Math.max(180, Math.min(500, spaceAbove - 16));
      styleObj.bottom = `${Math.round(winH - rect.top + 6)}px`;
      styleObj.top = 'auto';
      styleObj.maxHeight = `${Math.round(maxHeight)}px`;
    } else {
      const maxHeight = Math.max(180, Math.min(500, spaceBelow - 16));
      styleObj.top = `${Math.round(rect.bottom + 6)}px`;
      styleObj.bottom = 'auto';
      styleObj.maxHeight = `${Math.round(maxHeight)}px`;
    }

    cardPositionStyle.value = styleObj;
  }

  function show() {
    if (!triggerEl && anchorRef.value) {
      triggerEl = anchorRef.value.parentElement;
    }
    updatePosition();
    isVisible.value = true;
  }

  function hide() {
    isVisible.value = false;
  }

  function handleScroll() {
    if (isVisible.value) {
      updatePosition();
    }
  }

  onMounted(() => {
    if (typeof window === 'undefined') return;
    triggerEl = anchorRef.value?.parentElement ?? null;
    if (triggerEl) {
      triggerEl.addEventListener('mouseenter', show);
      triggerEl.addEventListener('mouseleave', hide);
      triggerEl.addEventListener('focusin', show);
      triggerEl.addEventListener('focusout', hide);
    }
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);
  });

  onUnmounted(() => {
    if (typeof window === 'undefined') return;
    if (triggerEl) {
      triggerEl.removeEventListener('mouseenter', show);
      triggerEl.removeEventListener('mouseleave', hide);
      triggerEl.removeEventListener('focusin', show);
      triggerEl.removeEventListener('focusout', hide);
    }
    window.removeEventListener('scroll', handleScroll, true);
    window.removeEventListener('resize', handleScroll);
  });

  return {
    isVisible,
    cardPositionStyle,
    anchorRef,
    show,
    hide,
    updatePosition,
  };
}
