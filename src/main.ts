import './styles.css';
import { App } from './app';
import { store } from './store';
import { photoStore } from './photoStore';
import { type Grow, type Plant, type EntryType, generateId, calculateGrowDates } from './types';

// Declare Twemoji on window
declare global {
    interface Window {
        twemoji: {
            parse: (node: Node | string, options?: {
                folder?: string; ext?: string; base?: string;
                callback?: (icon: string) => string | false;
            }) => string | void;
        };
        /** Emoji this site ships as SVG (public/emoji/list.js) */
        GROW_EMOJI?: Set<string>;
        createMockGrow: () => void;
    }
}

/**
 * Resize image to 780p (max height 780px) for mock data
 */
async function resizeImageToBlob(blob: Blob): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let { width, height } = img;

                // Scale down to 780p (max height 780px)
                const maxHeight = 780;
                if (height > maxHeight) {
                    const ratio = maxHeight / height;
                    width *= ratio;
                    height *= ratio;
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d')!;
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (resizedBlob) => {
                        if (resizedBlob) {
                            resolve(resizedBlob);
                        } else {
                            reject(new Error('Failed to resize image'));
                        }
                    },
                    'image/jpeg',
                    0.9 // Good quality
                );
            };
            img.onerror = reject;
            img.src = e.target!.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/**
 * Create a complete mock grow with realistic entries for testing
 * Loads photos from example images folder if available
 */
async function createMockGrow(): Promise<void> {
    console.log('📸 Loading example images...');

    // Load example images from the example images folder
    const exampleImages = [
        '20251014_090832.jpg',
        '20251014_183610.jpg',
        '20251022_121056.jpg',
        '20251022_131801_001.jpg',
        '20251027_133710.jpg',
        '20251028_192911.jpg',
        '20251031_172539.jpg',
        '20251104_182953.jpg',
        '20251107_140243.jpg',
        '20251107_164551.jpg',
    ];

    // Load and store photos in IndexedDB
    const photoIds: string[] = [];
    for (const imageName of exampleImages) {
        try {
            const response = await fetch(`/example images/${imageName}`);
            if (response.ok) {
                const blob = await response.blob();
                const resizedBlob = await resizeImageToBlob(blob);
                const photoId = generateId('photo');
                await photoStore.savePhoto(photoId, resizedBlob);
                photoIds.push(photoId);
            }
        } catch (err) {
            console.warn(`Failed to load ${imageName}:`, err);
        }
    }

    console.log(`✅ Loaded ${photoIds.length} photos into IndexedDB`);

    // Start date ~75 days ago for a grow nearing harvest
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 75);
    const germStart = startDate.toISOString().split('T')[0];

    const dates = calculateGrowDates(germStart, 7, 3, 8, 10);

    const plants: Plant[] = [
        { id: generateId(), potNumber: 1, name: 'Plant 1', strain: 'Northern Lights', potLiters: 11 },
        { id: generateId(), potNumber: 2, name: 'Plant 2', strain: 'Northern Lights', potLiters: 11 },
        { id: generateId(), potNumber: 3, name: 'Plant 3', strain: 'Northern Lights', potLiters: 15 },
        { id: generateId(), potNumber: 4, name: 'Plant 4', strain: 'Northern Lights', potLiters: 11 },
    ];

    const grow: Grow = {
        id: generateId(),
        name: 'Northern Lights #5',
        strain: 'Northern Lights #5',
        type: 'photo',
        plantCount: 4,
        plants,
        dates,
        light: { ppfd: 800, vegHours: 18, flowerHours: 12 },
        tent: { width: 100, depth: 100 },
        entries: [],
        createdAt: germStart,
        updatedAt: germStart,
    };

    // Create the grow first (entries will be empty)
    const newGrow = store.addGrow(grow);
    const plantIds = newGrow.plants.map(p => p.id);

    // Helper to add entry using the store method with all fields
    type EntryOptions = {
        tags?: string[];
        plantIds?: string[];
        dli?: number;
        photoIds?: string[];
    };

    let photoIndex = 0;
    const getNextPhotos = (count: number = 1): string[] => {
        const photos: string[] = [];
        for (let i = 0; i < count; i++) {
            if (photoIds.length > 0) {
                photos.push(photoIds[photoIndex % photoIds.length]);
                photoIndex++;
            }
        }
        return photos;
    };

    const addEntry = (
        daysFromStart: number,
        type: EntryType,
        title: string,
        content?: string,
        options?: EntryOptions
    ) => {
        const date = new Date(startDate);
        date.setDate(date.getDate() + daysFromStart);
        const dateStr = date.toISOString().split('T')[0];

        store.addEntry(newGrow.id, {
            date: dateStr,
            type,
            title,
            content,
            tags: options?.tags,
            plantIds: options?.plantIds,
            dli: options?.dli,
            photoIds: options?.photoIds,
        });
    };

    // Germination phase (days 0-5)
    addEntry(0, 'note', 'Seeds planted', 'Soaked seeds for 24h in shot glass. They sank like little submarines! 🚀',
        { tags: ['germination', 'start'], dli: 5, photoIds: getNextPhotos(1) });
    addEntry(2, 'note', 'Tap roots visible', 'All 4 seeds cracked open. Nature is wild - tiny white tails poking out!',
        { tags: ['germination', 'progress'], dli: 8, photoIds: getNextPhotos(1) });
    addEntry(4, 'milestone', 'Sprout', 'All seedlings above soil! They look like tiny aliens emerging 👽🌱',
        { tags: ['milestone', 'sprout'], plantIds, dli: 10, photoIds: getNextPhotos(1) });

    // Seedling phase (days 5-19)
    addEntry(6, 'watering', 'First watering', 'Light misting around seedlings. Trying not to drown my babies!',
        { tags: ['watering'], plantIds, dli: 12, photoIds: getNextPhotos(1) });
    addEntry(8, 'note', 'First true leaves', 'Real leaves coming in! No longer just seed leaves. Growing up so fast 🥲',
        { tags: ['growth', 'leaves'], dli: 14, photoIds: getNextPhotos(1) });
    addEntry(10, 'watering', 'Watered', '50ml each - they drink like tiny alcoholics',
        { tags: ['watering'], plantIds, dli: 15, photoIds: getNextPhotos(1) });
    addEntry(12, 'watering', 'Watered', '75ml each. Plant #3 is the thirstiest of the bunch',
        { tags: ['watering'], plantIds: [plantIds[2]], dli: 16, photoIds: getNextPhotos(1) });
    addEntry(14, 'feeding', 'First feed', '1/4 strength nutes. Baby food for baby plants!',
        { tags: ['feeding', 'nutrients'], plantIds, dli: 18, photoIds: getNextPhotos(1) });
    addEntry(16, 'watering', 'Watered', 'Everyone looking perky. Plant #2 is the runt but has heart ❤️',
        { tags: ['watering', 'observation'], plantIds: [plantIds[1]], dli: 18, photoIds: getNextPhotos(1) });
    addEntry(18, 'milestone', 'Transplant', 'Moved to 1L pots. Root balls looked beautiful - white spaghetti!',
        { tags: ['milestone', 'transplant', 'roots'], plantIds, dli: 20, photoIds: getNextPhotos(1) });

    // Veg phase (days 19-47)
    addEntry(20, 'watering', 'Watered', '200ml each. They\'re growing so fast I can almost hear them',
        { tags: ['watering'], plantIds, dli: 28, photoIds: getNextPhotos(1) });
    addEntry(22, 'feeding', 'Fed', '1/2 strength veg nutes. Nom nom nom 🍽️',
        { tags: ['feeding', 'nutrients', 'veg'], plantIds, dli: 30, photoIds: getNextPhotos(1) });
    addEntry(24, 'watering', 'Watered', 'Leaves are getting huge. Feeling like a proud plant parent!',
        { tags: ['watering', 'growth'], plantIds, dli: 32, photoIds: getNextPhotos(1) });
    addEntry(26, 'milestone', 'LST Started', 'Bent main stems, tied down. Sorry girls, it\'s for your own good! 🙏',
        { tags: ['training', 'LST', 'milestone'], plantIds, dli: 35, photoIds: getNextPhotos(1) });
    addEntry(28, 'feeding', 'Fed', 'Full strength veg nutes. They can handle it now - big girls!',
        { tags: ['feeding', 'nutrients'], plantIds, dli: 38, photoIds: getNextPhotos(1) });
    addEntry(30, 'watering', 'Watered', 'The canopy is filling in nicely. Looking bushy! 🌳',
        { tags: ['watering', 'canopy'], plantIds, dli: 40, photoIds: getNextPhotos(1) });
    addEntry(32, 'milestone', 'Topped', 'Topped all plants above 5th node. Felt like a surgeon ✂️',
        { tags: ['training', 'topping', 'milestone'], plantIds, dli: 40, photoIds: getNextPhotos(1) });
    addEntry(34, 'feeding', 'Fed', 'They bounced back from topping like nothing happened. Resilient queens!',
        { tags: ['feeding', 'recovery'], plantIds, dli: 42, photoIds: getNextPhotos(1) });
    addEntry(35, 'issue', 'Minor yellowing', 'Plant #1 showing slight nitrogen deficiency. Upped the N a bit.',
        { tags: ['issue', 'deficiency', 'nitrogen'], plantIds: [plantIds[0]], dli: 42, photoIds: getNextPhotos(1) });
    addEntry(36, 'watering', 'Watered', 'New growth sites popping up everywhere. It\'s working!',
        { tags: ['watering', 'growth'], plantIds, dli: 43, photoIds: getNextPhotos(1) });
    addEntry(38, 'milestone', 'Transplant', 'Final transplant to 11L/15L pots. These roots are THICC 💪',
        { tags: ['milestone', 'transplant', 'final-pot'], plantIds, dli: 44, photoIds: getNextPhotos(1) });
    addEntry(40, 'watering', 'Watered', '500ml each. Big pots = big drinks',
        { tags: ['watering'], plantIds, dli: 45, photoIds: getNextPhotos(1) });
    addEntry(42, 'feeding', 'Fed', 'Heavy veg feed before flip. Last supper before the big change!',
        { tags: ['feeding', 'pre-flip'], plantIds, dli: 45, photoIds: getNextPhotos(1) });
    addEntry(44, 'milestone', 'Defoliation', 'Removed lower growth, lollipopped. RIP little leaves, you served well 🪦',
        { tags: ['training', 'defoliation', 'lollipop'], plantIds, dli: 45, photoIds: getNextPhotos(1) });
    addEntry(46, 'watering', 'Watered', 'They look like proper bushes now. So proud!',
        { tags: ['watering', 'pre-flip'], plantIds, dli: 45, photoIds: getNextPhotos(1) });

    // Flip to flower (day 47)
    addEntry(47, 'milestone', 'Flipped to 12/12', 'Let there be darkness! Time to make some flowers 🌸✨',
        { tags: ['milestone', 'flip', 'flower', '12/12'], plantIds, dli: 35, photoIds: getNextPhotos(1) });

    // Flower phase (days 47-75+)
    addEntry(49, 'watering', 'Watered', 'First day of flower. Nothing visible yet but I can feel the excitement!',
        { tags: ['watering', 'flower-week-1'], plantIds, dli: 36, photoIds: getNextPhotos(1) });
    addEntry(51, 'feeding', 'Fed', 'Transition nutes - half veg, half bloom. The metamorphosis begins!',
        { tags: ['feeding', 'transition'], plantIds, dli: 38, photoIds: getNextPhotos(1) });
    addEntry(53, 'watering', 'Watered', 'Is that... are those... pre-flowers?! *squints*',
        { tags: ['watering', 'pre-flower'], plantIds, dli: 40, photoIds: getNextPhotos(1) });
    addEntry(55, 'note', 'Stretch starting', 'Plants growing 2 inches overnight! STRETCH MODE ACTIVATED 📈',
        { tags: ['growth', 'stretch', 'observation'], dli: 42, photoIds: getNextPhotos(1) });
    addEntry(57, 'feeding', 'Fed', 'Full bloom nutes now. Feed me Seymour! 🌿',
        { tags: ['feeding', 'bloom'], plantIds, dli: 44, photoIds: getNextPhotos(1) });
    addEntry(58, 'issue', 'Light stress', 'Plant #3 showing some taco leaves. Raised the light 2 inches.',
        { tags: ['issue', 'light-stress'], plantIds: [plantIds[2]], dli: 46, photoIds: getNextPhotos(1) });
    addEntry(59, 'watering', 'Watered', 'The stretch is real. Had to raise the light again!',
        { tags: ['watering', 'stretch'], plantIds, dli: 45, photoIds: getNextPhotos(1) });
    addEntry(61, 'milestone', 'First Pistils', 'White hairs appearing everywhere! It\'s a girl party! 🎉💃',
        { tags: ['milestone', 'pistils', 'female'], plantIds, dli: 48, photoIds: getNextPhotos(1) });
    addEntry(63, 'feeding', 'Fed', 'Drinking more water now. Thirsty flower girls!',
        { tags: ['feeding', 'flower'], plantIds, dli: 50, photoIds: getNextPhotos(1) });
    addEntry(65, 'watering', 'Watered', 'Bud sites forming at every node. Christmas tree vibes 🎄',
        { tags: ['watering', 'buds'], plantIds, dli: 52, photoIds: getNextPhotos(2) });
    addEntry(67, 'milestone', 'Defoliation', 'Light defoliation for airflow. The girls needed a haircut 💇‍♀️',
        { tags: ['training', 'defoliation', 'airflow'], plantIds, dli: 52, photoIds: getNextPhotos(1) });
    addEntry(69, 'feeding', 'Fed', 'PK boost added. Time to fatten up those buds! 🍑',
        { tags: ['feeding', 'pk-boost', 'flower'], plantIds, dli: 55, photoIds: getNextPhotos(1) });
    addEntry(71, 'watering', 'Watered', 'Smell is starting to come through. Tent reeks! 👃💨',
        { tags: ['watering', 'smell', 'terpenes'], plantIds, dli: 55, photoIds: getNextPhotos(1) });
    addEntry(73, 'note', 'Buds fattening', 'Looking frosty! Trichomes are sparkling like diamonds ❄️💎',
        { tags: ['observation', 'trichomes', 'frost'], dli: 58, photoIds: getNextPhotos(2) });
    addEntry(75, 'feeding', 'Fed', 'Still stacking! These colas are getting chunky 🌽',
        { tags: ['feeding', 'flower', 'colas'], plantIds, dli: 60, photoIds: getNextPhotos(1) });

    // Flush phase (days 76-85)
    addEntry(76, 'milestone', 'Flush started', 'Time to clean house! Plain water only for the next 10 days 🧽',
        { tags: ['milestone', 'flush', 'water-only'], plantIds, dli: 60, photoIds: getNextPhotos(1) });
    addEntry(78, 'watering', 'Flushed', 'Day 3 of flush. Plants looking a bit sad but it\'s for their own good!',
        { tags: ['watering', 'flush'], plantIds, dli: 58, photoIds: getNextPhotos(1) });
    addEntry(80, 'note', 'Flush progress', 'Buds are hardening up. Smell is intensifying! 🌶️',
        { tags: ['observation', 'flush', 'smell'], dli: 55, photoIds: getNextPhotos(1) });
    addEntry(82, 'watering', 'Flushed', 'Halfway through flush. The wait is killing me! 😩',
        { tags: ['watering', 'flush'], plantIds, dli: 52, photoIds: getNextPhotos(1) });
    addEntry(84, 'note', 'Amber trichs', 'Some trichomes turning amber. Almost ready! 🍯',
        { tags: ['observation', 'trichomes', 'amber'], dli: 50, photoIds: getNextPhotos(1) });
    addEntry(85, 'milestone', 'Flush complete', 'Last day of flush! Harvest tomorrow! 🎉',
        { tags: ['milestone', 'flush-complete', 'harvest-soon'], plantIds, dli: 48, photoIds: getNextPhotos(1) });

    // Harvest phase (day 86+)
    addEntry(86, 'milestone', 'HARVEST DAY!', 'The big day has arrived! Let\'s get these ladies out of here! 🌿✂️',
        { tags: ['milestone', 'harvest', 'complete'], plantIds, dli: 45, photoIds: getNextPhotos(2) });
    addEntry(87, 'note', 'Drying started', 'Hanging upside down in the dark. Patience is key! 🕯️',
        { tags: ['drying', 'post-harvest'], dli: 0, photoIds: getNextPhotos(1) });
    addEntry(89, 'note', 'Trimming complete', 'Buds are trimmed and ready for jars. What a journey! 📦',
        { tags: ['trimming', 'curing'], dli: 0, photoIds: getNextPhotos(1) });
    console.log('✅ Mock grow created:', newGrow.strain);
    console.log('📅 Start:', germStart, '→ Harvest:', dates.harvest);
    console.log('📝 Entries:', newGrow.entries.length);

    // Reload page to see the new grow
    window.location.reload();
}

// Expose to window for console access
window.createMockGrow = createMockGrow;

/**
 * Parse emojis in the DOM and replace with Twemoji images
 */
function parseEmojis(): void {
    if (!window.twemoji) return;
    window.twemoji.parse(document.body, {
        // Served from this site (public/emoji, filled by scripts/bundle-emoji.mjs):
        // no CDN request, no IP address leaving the device, and it works offline.
        base: '/emoji/',
        folder: 'svg',
        ext: '.svg',
        // Emoji a grower types into a note are not bundled — leave those to the system
        callback: (icon: string) => (window.GROW_EMOJI?.has(icon) ? `/emoji/svg/${icon}.svg` : false),
    });
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize theme before rendering app
    // Check localStorage first for compatibility with landing/help pages
    const { applyTheme, getSystemTheme, watchSystemTheme } = await import('./theme');
    const settings = store.getSettings();

    // Sync localStorage theme with settings if different
    const storedTheme = localStorage.getItem('og-grow-theme');
    if (storedTheme === 'light' || storedTheme === 'dark') {
        // User set theme from landing page, sync to settings
        if (settings.theme !== storedTheme) {
            settings.theme = storedTheme;
            store.updateSettings(settings);
        }
        applyTheme(storedTheme);
        localStorage.setItem('og-grow-theme', storedTheme);
    } else if (settings.theme === 'auto') {
        // Apply system theme and watch for changes
        applyTheme(getSystemTheme());
        watchSystemTheme((theme) => {
            // Only apply if still in auto mode
            if (store.getSettings().theme === 'auto') {
                applyTheme(theme);
            }
        });
    } else {
        // Apply saved theme preference from settings
        applyTheme(settings.theme);
        localStorage.setItem('og-grow-theme', settings.theme);
    }

    new App('#app', '#modal');

    // Parse emojis on initial load
    parseEmojis();

    // Re-parse emojis when DOM changes (for dynamically rendered content)
    const observer = new MutationObserver((mutations) => {
        let shouldParse = false;
        for (const mutation of mutations) {
            if (mutation.addedNodes.length > 0) {
                shouldParse = true;
                break;
            }
        }
        if (shouldParse) {
            parseEmojis();
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
});
