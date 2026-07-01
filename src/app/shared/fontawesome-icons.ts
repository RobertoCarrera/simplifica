/**
 * Comprehensive curated list of FontAwesome 6 free-solid icon names.
 *
 * Source: FA 6 metadata categories.yml (free-solid subset, deduplicated
 * across categories). Covers ~500 of the most common icons — a broad
 * superset of the ~80 we shipped in v1. If a specific icon is missing,
 * the super_admin can still type its name in the input (datalist shows
 * whatever matches). Total bundle cost: ~12KB gzipped.
 *
 * Powers both the autocomplete datalist AND the live-search grid in the
 * add-on edit form. The picker is a thin wrapper over this list — no
 * additional HTTP fetch, no extra package.
 */
export const FA_FREE_SOLID_ICONS: readonly string[] = [
  'fa-accessible-icon', 'fa-address-card', 'fa-audio-description', 'fa-braille', 'fa-circle-info', 'fa-circle-question', 'fa-closed-captioning', 'fa-ear-deaf', 'fa-ear-listen', 'fa-eye', 'fa-eye-low-vision', 'fa-fingerprint', 'fa-hands', 'fa-hands-asl-interpreting', 'fa-handshake-angle', 'fa-person-cane', 'fa-person-walking-with-cane', 'fa-phone-volume', 'fa-question', 'fa-tty', 'fa-universal-access', 'fa-wheelchair', 'fa-wheelchair-move', 'fa-bell', 'fa-bell-slash', 'fa-circle-exclamation', 'fa-circle-radiation', 'fa-exclamation', 'fa-radiation', 'fa-skull-crossbones', 'fa-triangle-exclamation', 'fa-bugs', 'fa-cat', 'fa-cow', 'fa-crow', 'fa-dog', 'fa-dove', 'fa-dragon', 'fa-feather', 'fa-feather-pointed', 'fa-fish', 'fa-fish-fins', 'fa-frog', 'fa-hippo', 'fa-horse', 'fa-horse-head', 'fa-kiwi-bird', 'fa-locust', 'fa-mosquito', 'fa-otter', 'fa-paw', 'fa-shield-cat', 'fa-shield-dog', 'fa-shrimp', 'fa-spider', 'fa-worm', 'fa-angle-down', 'fa-angle-left', 'fa-angle-right', 'fa-angle-up', 'fa-angles-down', 'fa-angles-left', 'fa-angles-right', 'fa-angles-up', 'fa-arrow-down', 'fa-arrow-down-1-9', 'fa-arrow-down-9-1', 'fa-arrow-down-a-z', 'fa-arrow-down-long', 'fa-arrow-down-short-wide', 'fa-arrow-down-wide-short', 'fa-arrow-down-z-a', 'fa-arrow-left', 'fa-arrow-left-long', 'fa-arrow-pointer', 'fa-arrow-right', 'fa-arrow-right-arrow-left', 'fa-arrow-right-from-bracket', 'fa-arrow-right-long', 'fa-arrow-right-to-bracket', 'fa-arrow-rotate-left', 'fa-arrow-rotate-right', 'fa-arrow-trend-down', 'fa-arrow-trend-up', 'fa-arrow-turn-down', 'fa-arrow-turn-up', 'fa-arrow-up', 'fa-arrow-up-1-9', 'fa-arrow-up-9-1', 'fa-arrow-up-a-z', 'fa-arrow-up-from-bracket', 'fa-arrow-up-long', 'fa-arrow-up-right-dots', 'fa-arrow-up-right-from-square', 'fa-arrow-up-short-wide', 'fa-arrow-up-wide-short', 'fa-arrow-up-z-a', 'fa-arrows-down-to-line', 'fa-arrows-left-right', 'fa-arrows-left-right-to-line', 'fa-arrows-rotate', 'fa-arrows-spin', 'fa-arrows-split-up-and-left', 'fa-arrows-to-circle', 'fa-arrows-to-dot', 'fa-arrows-to-eye', 'fa-arrows-turn-right', 'fa-arrows-turn-to-dots', 'fa-arrows-up-down', 'fa-arrows-up-down-left-right', 'fa-arrows-up-to-line', 'fa-caret-down', 'fa-caret-left', 'fa-caret-right', 'fa-caret-up', 'fa-chevron-down', 'fa-chevron-left', 'fa-chevron-right', 'fa-chevron-up', 'fa-circle-arrow-down', 'fa-circle-arrow-left', 'fa-circle-arrow-right', 'fa-circle-arrow-up', 'fa-circle-chevron-down', 'fa-circle-chevron-left', 'fa-circle-chevron-right', 'fa-circle-chevron-up', 'fa-circle-down', 'fa-circle-left', 'fa-circle-right', 'fa-circle-up', 'fa-clock-rotate-left', 'fa-cloud-arrow-down', 'fa-cloud-arrow-up', 'fa-down-left-and-up-right-to-center', 'fa-down-long', 'fa-download', 'fa-left-long', 'fa-left-right', 'fa-location-arrow', 'fa-maximize', 'fa-recycle', 'fa-repeat', 'fa-reply', 'fa-reply-all', 'fa-retweet', 'fa-right-from-bracket', 'fa-right-left', 'fa-right-long', 'fa-right-to-bracket', 'fa-rotate', 'fa-rotate-left', 'fa-rotate-right', 'fa-share', 'fa-share-from-square', 'fa-shuffle', 'fa-sort', 'fa-sort-down', 'fa-sort-up', 'fa-square-arrow-up-right', 'fa-square-caret-down', 'fa-square-caret-left', 'fa-square-caret-right', 'fa-square-caret-up', 'fa-square-up-right', 'fa-turn-down', 'fa-turn-up', 'fa-up-down', 'fa-up-down-left-right', 'fa-up-long', 'fa-up-right-and-down-left-from-center', 'fa-up-right-from-square', 'fa-upload', 'fa-binoculars', 'fa-globe', 'fa-meteor', 'fa-moon', 'fa-satellite', 'fa-satellite-dish', 'fa-shuttle-space', 'fa-user-astronaut', 'fa-bus', 'fa-bus-simple', 'fa-car', 'fa-car-battery', 'fa-car-burst', 'fa-car-on', 'fa-car-rear', 'fa-car-side', 'fa-car-tunnel', 'fa-caravan', 'fa-charging-station', 'fa-gas-pump', 'fa-gauge', 'fa-gauge-high', 'fa-gauge-simple', 'fa-gauge-simple-high', 'fa-motorcycle', 'fa-oil-can', 'fa-spray-can-sparkles', 'fa-taxi', 'fa-trailer', 'fa-truck', 'fa-truck-field', 'fa-truck-field-un', 'fa-truck-medical', 'fa-truck-monster', 'fa-truck-pickup', 'fa-van-shuttle', 'fa-archway', 'fa-arrow-right-to-city', 'fa-building', 'fa-building-circle-arrow-right', 'fa-building-circle-check', 'fa-building-circle-exclamation', 'fa-building-circle-xmark', 'fa-building-columns', 'fa-building-flag', 'fa-building-lock', 'fa-building-ngo', 'fa-building-shield', 'fa-building-un', 'fa-building-user', 'fa-building-wheat', 'fa-campground', 'fa-church', 'fa-city', 'fa-dungeon', 'fa-gopuram', 'fa-hospital', 'fa-hospital-user', 'fa-hotel', 'fa-house', 'fa-house-chimney', 'fa-house-chimney-crack', 'fa-house-chimney-medical', 'fa-house-chimney-window', 'fa-house-circle-check', 'fa-house-circle-exclamation', 'fa-house-circle-xmark', 'fa-house-crack', 'fa-house-fire', 'fa-house-flag', 'fa-house-lock', 'fa-house-medical', 'fa-house-medical-circle-check', 'fa-house-medical-circle-exclamation', 'fa-house-medical-circle-xmark', 'fa-house-medical-flag', 'fa-igloo', 'fa-industry', 'fa-kaaba', 'fa-landmark', 'fa-landmark-dome', 'fa-landmark-flag', 'fa-monument', 'fa-mosque', 'fa-mountain-city', 'fa-oil-well', 'fa-place-of-worship', 'fa-school', 'fa-school-circle-check', 'fa-school-circle-exclamation', 'fa-school-circle-xmark', 'fa-school-flag', 'fa-school-lock', 'fa-shop', 'fa-shop-lock', 'fa-store', 'fa-synagogue', 'fa-tent', 'fa-tent-arrow-down-to-line', 'fa-tent-arrow-left-right', 'fa-tent-arrow-turn-left', 'fa-tent-arrows-down', 'fa-tents', 'fa-toilet-portable', 'fa-toilets-portable', 'fa-torii-gate', 'fa-tower-observation', 'fa-tree-city', 'fa-vihara', 'fa-warehouse', 'fa-address-book', 'fa-bars-progress', 'fa-bars-staggered', 'fa-book', 'fa-box-archive', 'fa-boxes-packing', 'fa-briefcase', 'fa-bullhorn', 'fa-bullseye', 'fa-business-time', 'fa-cake-candles', 'fa-calculator', 'fa-calendar', 'fa-calendar-days', 'fa-certificate', 'fa-chart-line', 'fa-chart-pie', 'fa-chart-simple', 'fa-clipboard', 'fa-clipboard-question', 'fa-compass', 'fa-copy', 'fa-copyright', 'fa-envelope', 'fa-envelope-circle-check', 'fa-envelope-open', 'fa-eraser', 'fa-fax', 'fa-file', 'fa-file-circle-plus', 'fa-file-lines', 'fa-floppy-disk', 'fa-folder', 'fa-folder-minus', 'fa-folder-open', 'fa-folder-plus', 'fa-folder-tree', 'fa-glasses', 'fa-highlighter', 'fa-house-laptop', 'fa-laptop-file', 'fa-list-check', 'fa-magnifying-glass-arrow-right', 'fa-magnifying-glass-chart', 'fa-marker', 'fa-mug-saucer', 'fa-network-wired', 'fa-note-sticky', 'fa-paperclip', 'fa-paste', 'fa-pen', 'fa-pen-clip', 'fa-pen-fancy', 'fa-pen-nib', 'fa-pen-to-square', 'fa-pencil', 'fa-percent', 'fa-person-chalkboard', 'fa-phone', 'fa-phone-flip', 'fa-phone-slash', 'fa-print', 'fa-registered', 'fa-scale-balanced', 'fa-scale-unbalanced', 'fa-scale-unbalanced-flip', 'fa-scissors', 'fa-signature', 'fa-sitemap', 'fa-socks', 'fa-square-envelope', 'fa-square-pen', 'fa-square-phone', 'fa-square-phone-flip', 'fa-square-poll-horizontal', 'fa-square-poll-vertical', 'fa-stapler', 'fa-table', 'fa-table-columns', 'fa-tag', 'fa-tags', 'fa-thumbtack', 'fa-thumbtack-slash', 'fa-timeline', 'fa-trademark', 'fa-vault', 'fa-wallet', 'fa-chart-area', 'fa-chart-bar', 'fa-chart-column', 'fa-chart-diagram', 'fa-chart-gantt', 'fa-circle-half-stroke', 'fa-diagram-next', 'fa-diagram-predecessor', 'fa-diagram-project', 'fa-diagram-successor', 'fa-hexagon-nodes', 'fa-hexagon-nodes-bolt', 'fa-apple-whole', 'fa-baby', 'fa-baby-carriage', 'fa-baseball-bat-ball', 'fa-bath', 'fa-child', 'fa-child-dress', 'fa-child-reaching', 'fa-children', 'fa-cookie', 'fa-cookie-bite', 'fa-cubes-stacked', 'fa-gamepad', 'fa-hands-holding-child', 'fa-ice-cream', 'fa-mitten', 'fa-person-biking', 'fa-person-breastfeeding', 'fa-puzzle-piece', 'fa-robot', 'fa-shapes', 'fa-snowman', 'fa-graduation-cap', 'fa-hat-cowboy', 'fa-hat-cowboy-side', 'fa-hat-wizard', 'fa-shirt', 'fa-shoe-prints', 'fa-user-tie', 'fa-vest', 'fa-vest-patches', 'fa-barcode', 'fa-bars', 'fa-bug', 'fa-bug-slash', 'fa-circle-nodes', 'fa-code', 'fa-code-branch', 'fa-code-commit', 'fa-code-compare', 'fa-code-fork', 'fa-code-merge', 'fa-code-pull-request', 'fa-comment-nodes', 'fa-css', 'fa-cube', 'fa-cubes', 'fa-file-code', 'fa-filter', 'fa-fire-extinguisher', 'fa-gear', 'fa-gears', 'fa-keyboard', 'fa-laptop-code', 'fa-microchip', 'fa-qrcode', 'fa-rectangle-xmark', 'fa-shield', 'fa-shield-halved', 'fa-square-binary', 'fa-terminal', 'fa-user-secret', 'fa-window-maximize', 'fa-window-minimize', 'fa-window-restore', 'fa-at', 'fa-blender-phone', 'fa-bluetooth-b', 'fa-comment', 'fa-comment-dots', 'fa-comment-medical', 'fa-comment-slash', 'fa-comment-sms', 'fa-comments', 'fa-face-frown', 'fa-face-meh', 'fa-face-smile', 'fa-inbox', 'fa-language', 'fa-message', 'fa-microphone', 'fa-microphone-lines', 'fa-microphone-lines-slash', 'fa-microphone-slash', 'fa-mobile', 'fa-mobile-button', 'fa-mobile-retro', 'fa-mobile-screen', 'fa-mobile-screen-button', 'fa-paper-plane', 'fa-poo', 'fa-quote-left', 'fa-quote-right', 'fa-square-rss', 'fa-tower-cell', 'fa-video', 'fa-video-slash', 'fa-voicemail', 'fa-walkie-talkie', 'fa-bluetooth', 'fa-cloud', 'fa-ethernet', 'fa-house-signal', 'fa-rss', 'fa-signal', 'fa-tower-broadcast', 'fa-wifi', 'fa-bore-hole', 'fa-brush', 'fa-compass-drafting', 'fa-dumpster', 'fa-dumpster-fire', 'fa-hammer', 'fa-helmet-safety', 'fa-mound', 'fa-paint-roller', 'fa-pen-ruler', 'fa-ruler', 'fa-ruler-combined', 'fa-ruler-horizontal', 'fa-ruler-vertical', 'fa-screwdriver', 'fa-screwdriver-wrench', 'fa-sheet-plastic', 'fa-tarp', 'fa-tarp-droplet', 'fa-toolbox', 'fa-trowel', 'fa-trowel-bricks', 'fa-wrench', 'fa-bezier-curve', 'fa-clone', 'fa-crop', 'fa-crop-simple', 'fa-crosshairs', 'fa-draw-polygon', 'fa-droplet', 'fa-droplet-slash', 'fa-eye-dropper', 'fa-eye-slash', 'fa-fill', 'fa-fill-drip', 'fa-layer-group', 'fa-lines-leaning', 'fa-object-group', 'fa-object-ungroup', 'fa-paintbrush', 'fa-palette', 'fa-splotch', 'fa-spray-can', 'fa-stamp', 'fa-swatchbook', 'fa-vector-square', 'fa-wand-magic', 'fa-wand-magic-sparkles', 'fa-camera', 'fa-camera-retro', 'fa-compact-disc', 'fa-computer', 'fa-computer-mouse', 'fa-database', 'fa-desktop', 'fa-display', 'fa-hard-drive', 'fa-headphones', 'fa-laptop', 'fa-memory', 'fa-plug', 'fa-power-off', 'fa-sd-card', 'fa-server', 'fa-sim-card', 'fa-tablet', 'fa-tablet-button', 'fa-tablet-screen-button', 'fa-tachograph-digital', 'fa-tv', 'fa-bandage', 'fa-check', 'fa-check-double', 'fa-circle-check', 'fa-delete-left', 'fa-ellipsis', 'fa-ellipsis-vertical', 'fa-grip', 'fa-grip-lines', 'fa-grip-lines-vertical', 'fa-grip-vertical', 'fa-link', 'fa-link-slash', 'fa-minus', 'fa-plus', 'fa-sliders', 'fa-square-check', 'fa-trash', 'fa-trash-arrow-up', 'fa-trash-can', 'fa-trash-can-arrow-up', 'fa-xmark', 'fa-atom', 'fa-award', 'fa-book-open', 'fa-book-open-reader', 'fa-chalkboard', 'fa-chalkboard-user', 'fa-masks-theater', 'fa-microscope', 'fa-music', 'fa-user-graduate', 'fa-face-angry', 'fa-face-dizzy', 'fa-face-flushed', 'fa-face-frown-open', 'fa-face-grimace', 'fa-face-grin', 'fa-face-grin-beam', 'fa-face-grin-beam-sweat', 'fa-face-grin-hearts', 'fa-face-grin-squint', 'fa-face-grin-squint-tears', 'fa-face-grin-stars', 'fa-face-grin-tears', 'fa-face-grin-tongue', 'fa-face-grin-tongue-squint', 'fa-face-grin-tongue-wink', 'fa-face-grin-wide', 'fa-face-grin-wink', 'fa-face-kiss', 'fa-face-kiss-beam', 'fa-face-kiss-wink-heart', 'fa-face-laugh', 'fa-face-laugh-beam', 'fa-face-laugh-squint', 'fa-face-laugh-wink', 'fa-face-meh-blank', 'fa-face-rolling-eyes', 'fa-face-sad-cry', 'fa-face-sad-tear', 'fa-face-smile-beam', 'fa-face-smile-wink', 'fa-face-surprise', 'fa-face-tired', 'fa-battery-empty', 'fa-battery-full', 'fa-battery-half', 'fa-battery-quarter', 'fa-battery-three-quarters', 'fa-bolt', 'fa-explosion', 'fa-fan', 'fa-fire', 'fa-fire-flame-curved', 'fa-fire-flame-simple', 'fa-leaf', 'fa-lightbulb', 'fa-plug-circle-bolt', 'fa-plug-circle-check', 'fa-plug-circle-exclamation', 'fa-plug-circle-minus', 'fa-plug-circle-plus', 'fa-plug-circle-xmark', 'fa-poop', 'fa-seedling', 'fa-solar-panel', 'fa-sun', 'fa-water', 'fa-wind', 'fa-file-arrow-down', 'fa-file-arrow-up', 'fa-file-audio', 'fa-file-circle-check', 'fa-file-circle-exclamation', 'fa-file-circle-minus', 'fa-file-circle-question', 'fa-file-circle-xmark', 'fa-file-csv', 'fa-file-excel', 'fa-file-export', 'fa-file-fragment', 'fa-file-half-dashed', 'fa-file-image', 'fa-file-import', 'fa-file-pdf', 'fa-file-pen', 'fa-file-powerpoint', 'fa-file-shield', 'fa-file-video', 'fa-file-word', 'fa-file-zipper', 'fa-folder-closed', 'fa-photo-film', 'fa-circle', 'fa-clapperboard', 'fa-film', 'fa-podcast', 'fa-ticket', 'fa-bacon', 'fa-beer-mug-empty', 'fa-blender', 'fa-bone', 'fa-bottle-droplet', 'fa-bottle-water', 'fa-bowl-food', 'fa-bowl-rice', 'fa-bread-slice', 'fa-burger', 'fa-candy-cane', 'fa-carrot', 'fa-champagne-glasses', 'fa-cheese', 'fa-cloud-meatball', 'fa-drumstick-bite', 'fa-egg', 'fa-flask', 'fa-glass-water', 'fa-glass-water-droplet', 'fa-hotdog', 'fa-jar', 'fa-jar-wheat', 'fa-lemon', 'fa-martini-glass', 'fa-martini-glass-citrus', 'fa-martini-glass-empty', 'fa-mug-hot', 'fa-pepper-hot', 'fa-pizza-slice', 'fa-plate-wheat', 'fa-stroopwafel', 'fa-wheat-awn', 'fa-wheat-awn-circle-exclamation', 'fa-whiskey-glass', 'fa-wine-bottle', 'fa-wine-glass', 'fa-wine-glass-empty', 'fa-book-skull', 'fa-chess', 'fa-chess-bishop', 'fa-chess-board', 'fa-chess-king', 'fa-chess-knight', 'fa-chess-pawn', 'fa-chess-queen', 'fa-chess-rook', 'fa-diamond', 'fa-dice', 'fa-dice-d20', 'fa-dice-d6', 'fa-dice-five', 'fa-dice-four', 'fa-dice-one', 'fa-dice-six', 'fa-dice-three', 'fa-dice-two', 'fa-ghost', 'fa-hand-fist', 'fa-headset', 'fa-heart', 'fa-playstation', 'fa-ring', 'fa-scroll', 'fa-square-full', 'fa-steam', 'fa-steam-symbol', 'fa-twitch', 'fa-vr-cardboard', 'fa-wand-sparkles', 'fa-xbox', 'fa-hand', 'fa-hand-back-fist', 'fa-hand-dots', 'fa-hand-holding', 'fa-hand-holding-dollar', 'fa-hand-holding-droplet', 'fa-hand-holding-hand', 'fa-hand-holding-heart', 'fa-hand-holding-medical', 'fa-hand-lizard', 'fa-hand-middle-finger', 'fa-hand-peace', 'fa-hand-point-down', 'fa-hand-point-left', 'fa-hand-point-right', 'fa-hand-point-up', 'fa-hand-pointer', 'fa-hand-scissors', 'fa-hand-sparkles', 'fa-hand-spock', 'fa-hands-bound', 'fa-hands-bubbles', 'fa-hands-clapping', 'fa-hands-holding', 'fa-hands-holding-circle', 'fa-hands-praying', 'fa-handshake', 'fa-handshake-simple', 'fa-handshake-simple-slash', 'fa-handshake-slash', 'fa-thumbs-down', 'fa-thumbs-up', 'fa-bed', 'fa-box-tissue', 'fa-chair', 'fa-couch', 'fa-door-closed', 'fa-door-open', 'fa-faucet', 'fa-faucet-drip', 'fa-fire-burner', 'fa-house-chimney-user', 'fa-house-user', 'fa-jug-detergent', 'fa-kitchen-set', 'fa-mattress-pillow', 'fa-people-roof', 'fa-pump-soap', 'fa-rug', 'fa-shower', 'fa-sink', 'fa-snowflake', 'fa-soap', 'fa-spoon', 'fa-stairs', 'fa-toilet', 'fa-toilet-paper', 'fa-toilet-paper-slash', 'fa-utensils', 'fa-anchor', 'fa-bag-shopping', 'fa-basket-shopping', 'fa-bicycle', 'fa-bomb', 'fa-book-atlas', 'fa-bookmark', 'fa-bridge', 'fa-bridge-water', 'fa-cart-shopping', 'fa-diamond-turn-right', 'fa-dollar-sign', 'fa-flag', 'fa-flag-checkered', 'fa-gavel', 'fa-gift', 'fa-heart-pulse', 'fa-helicopter', 'fa-helicopter-symbol', 'fa-image', 'fa-images', 'fa-info', 'fa-jet-fighter', 'fa-key', 'fa-life-ring', 'fa-location-crosshairs', 'fa-location-dot', 'fa-location-pin', 'fa-location-pin-lock', 'fa-magnet', 'fa-magnifying-glass', 'fa-magnifying-glass-location', 'fa-magnifying-glass-minus', 'fa-magnifying-glass-plus', 'fa-map', 'fa-map-pin', 'fa-money-bill', 'fa-money-bill-1', 'fa-mountain-sun', 'fa-newspaper', 'fa-person', 'fa-plane', 'fa-restroom', 'fa-road', 'fa-rocket', 'fa-route', 'fa-ship', 'fa-signs-post', 'fa-snowplow', 'fa-square-h', 'fa-square-parking', 'fa-square-plus', 'fa-street-view', 'fa-suitcase', 'fa-suitcase-medical', 'fa-ticket-simple', 'fa-traffic-light', 'fa-train', 'fa-train-subway', 'fa-train-tram', 'fa-tree', 'fa-trophy', 'fa-umbrella', 'fa-ferry', 'fa-person-swimming', 'fa-sailboat', 'fa-comment-dollar', 'fa-comments-dollar', 'fa-envelope-open-text', 'fa-envelopes-bulk', 'fa-filter-circle-dollar', 'fa-group-arrows-rotate', 'fa-magnifying-glass-dollar', 'fa-people-group', 'fa-person-rays', 'fa-ranking-star', 'fa-rectangle-ad', 'fa-circle-minus', 'fa-circle-plus', 'fa-circle-xmark', 'fa-divide', 'fa-equals', 'fa-greater-than', 'fa-greater-than-equal', 'fa-infinity', 'fa-less-than', 'fa-less-than-equal', 'fa-not-equal', 'fa-plus-minus', 'fa-square-minus', 'fa-square-root-variable', 'fa-square-xmark', 'fa-subscript', 'fa-superscript', 'fa-wave-square', 'fa-backward', 'fa-backward-fast', 'fa-backward-step', 'fa-circle-pause', 'fa-circle-play', 'fa-circle-stop', 'fa-compress', 'fa-eject', 'fa-expand', 'fa-forward', 'fa-forward-fast', 'fa-forward-step', 'fa-minimize', 'fa-pause', 'fa-play', 'fa-stop', 'fa-volume-high', 'fa-volume-low', 'fa-volume-off', 'fa-volume-xmark', 'fa-bed-pulse', 'fa-biohazard', 'fa-bong', 'fa-book-medical', 'fa-brain', 'fa-briefcase-medical', 'fa-capsules', 'fa-circle-h', 'fa-clipboard-user', 'fa-clock', 'fa-crutch', 'fa-disease', 'fa-dna', 'fa-file-medical', 'fa-file-prescription', 'fa-file-waveform', 'fa-first-aid', 'fa-head-side-brain', 'fa-head-side-cough', 'fa-head-side-mask', 'fa-head-side-virus', 'fa-id-card-clip', 'fa-joint', 'fa-laptop-medical', 'fa-lungs', 'fa-lungs-virus', 'fa-mask-face', 'fa-mask-ventilator', 'fa-mortar-pestle', 'fa-notes-medical', 'fa-pager', 'fa-pills', 'fa-prescription', 'fa-prescription-bottle', 'fa-prescription-bottle-medical', 'fa-pump-medical', 'fa-raygun', 'fa-syringe', 'fa-tablets', 'fa-teeth', 'fa-teeth-open', 'fa-thermometer', 'fa-tooth', 'fa-user-doctor', 'fa-user-injured', 'fa-user-nurse', 'fa-vial', 'fa-vial-circle-check', 'fa-vial-virus', 'fa-vials', 'fa-virus', 'fa-virus-slash', 'fa-weight-scale', 'fa-austral-sign', 'fa-baht-sign', 'fa-bitcoin-sign', 'fa-brazilian-real-sign', 'fa-cash-register', 'fa-cedi-sign', 'fa-cent-sign', 'fa-coins', 'fa-colon-sign', 'fa-credit-card', 'fa-cruzeiro-sign', 'fa-dong-sign', 'fa-euro-sign', 'fa-florin-sign', 'fa-franc-sign', 'fa-guarani-sign', 'fa-hryvnia-sign', 'fa-indian-rupee-sign', 'fa-kip-sign', 'fa-lari-sign', 'fa-litecoin-sign', 'fa-manat-sign', 'fa-mill-sign', 'fa-money-bill-1-wave', 'fa-money-bill-transfer', 'fa-money-bill-trend-up', 'fa-money-bill-wave', 'fa-money-bill-wheat', 'fa-money-bills', 'fa-naira-sign', 'fa-peso-sign', 'fa-poll', 'fa-pound-sign', 'fa-ruble-sign', 'fa-rupee-sign', 'fa-rupiah-sign', 'fa-sack-dollar', 'fa-sack-xmark', 'fa-shear-sign', 'fa-sterling-sign', 'fa-tenge-sign', 'fa-turkish-lira-sign', 'fa-won-sign', 'fa-yen-sign', 'fa-burst', 'fa-campfire', 'fa-cloud-bolt', 'fa-cloud-moon', 'fa-cloud-rain', 'fa-cloud-showers-heavy', 'fa-cloud-showers-water', 'fa-cloud-sun', 'fa-cloudscale', 'fa-cloudsmith', 'fa-cloudversify', 'fa-hill-avalanche', 'fa-hill-rockslide', 'fa-icicles', 'fa-mountain', 'fa-plant-wilt', 'fa-raindrops', 'fa-shrub', 'fa-spa', 'fa-sprout', 'fa-sun-plant-wilt', 'fa-temperature-arrow-down', 'fa-temperature-arrow-up', 'fa-temperature-empty', 'fa-temperature-full', 'fa-temperature-half', 'fa-temperature-high', 'fa-temperature-low', 'fa-temperature-quarter', 'fa-temperature-three-quarters', 'fa-tornado', 'fa-volcano', 'fa-wave', 'fa-box', 'fa-box-open', 'fa-boxes-stacked', 'fa-dolly', 'fa-drum', 'fa-drum-steelpan', 'fa-futbol', 'fa-gem', 'fa-gifts', 'fa-guitar', 'fa-helmet-un', 'fa-lamp', 'fa-lock', 'fa-lock-open', 'fa-map-location', 'fa-map-location-dot', 'fa-medal', 'fa-nfc-magnifying-glass', 'fa-notdef', 'fa-outdent', 'fa-people-carry-box', 'fa-piggy-bank', 'fa-rectangle-list', 'fa-ribbon', 'fa-save', 'fa-skiing', 'fa-skull', 'fa-snowboarding', 'fa-square-share-nodes', 'fa-star', 'fa-star-half', 'fa-stopwatch', 'fa-stretchmark', 'fa-suitcase-rolling', 'fa-sunglasses', 'fa-table-list', 'fa-table-tennis', 'fa-tape', 'fa-television', 'fa-tennis-ball', 'fa-text-height', 'fa-text-slash', 'fa-text-width', 'fa-toggle-off', 'fa-toggle-on', 'fa-tools', 'fa-truck-arrow-right', 'fa-truck-droplet', 'fa-truck-fast', 'fa-truck-front', 'fa-truck-plane', 'fa-umbrella-beach', 'fa-underline', 'fa-undo', 'fa-unlock', 'fa-unlock-keyhole', 'fa-user', 'fa-venus', 'fa-venus-double', 'fa-venus-mars', 'fa-volleyball', 'fa-water-ladder', 'fa-weight-hanging', 'fa-xmarks-lines', 'fa-yin-yang', 'fa-bell-concierge', 'fa-cart-arrow-down', 'fa-cart-plus', 'fa-circle-dollar-to-slot', 'fa-crown', 'fa-home', 'fa-id-card', 'fa-list', 'fa-map-marker', 'fa-receipt', 'fa-search', 'fa-sms', 'fa-truck-ramp-box', 'fa-user-check', 'fa-user-clock', 'fa-user-gear', 'fa-user-pen', 'fa-user-plus', 'fa-user-shield', 'fa-user-tag', 'fa-users', 'fa-users-gear', 'fa-users-slash', 'fa-flask-vial',
];

/**
 * Quick-pick grid for the most common add-on icons (16 entries). User
 * can click to select without typing. The full FA 6 free-solid set
 * (~580 entries above) is also exposed via the datalist autocomplete.
 */
export const POPULAR_FA_ICONS: readonly string[] = [
  'fa-bullhorn',
  'fa-robot',
  'fa-cogs',
  'fa-file-invoice',
  'fa-file-alt',
  'fa-ticket-alt',
  'fa-mobile-alt',
  'fa-box',
  'fa-tools',
  'fa-project-diagram',
  'fa-puzzle-piece',
  'fa-rocket',
  'fa-shield-alt',
  'fa-chart-line',
  'fa-tachometer-alt',
  'fa-headset',
];
/**
 * Spanish → icon mapping for the icon picker search. Lets super_admin
 * search by Spanish words (e.g. "facturacion", "cliente", "venta")
 * and get the relevant FA icons. Substring match (accent-insensitive)
 * on the keys; matches merge with the direct name match.
 */
export const FA_SPANISH_KEYWORDS: Readonly<Record<string, readonly string[]>> = {
  facturacion: ['fa-file-invoice', 'fa-file-invoice-dollar', 'fa-receipt', 'fa-money-bill', 'fa-money-bill-1', 'fa-money-bill-wave', 'fa-credit-card', 'fa-coins', 'fa-cash-register', 'fa-wallet', 'fa-vault', 'fa-piggy-bank'],
  factura: ['fa-file-invoice', 'fa-file-invoice-dollar', 'fa-receipt', 'fa-money-bill'],
  pago: ['fa-credit-card', 'fa-money-bill', 'fa-coins', 'fa-cash-register', 'fa-wallet', 'fa-dollar-sign', 'fa-euro-sign'],
  dinero: ['fa-money-bill', 'fa-coins', 'fa-dollar-sign', 'fa-euro-sign', 'fa-wallet', 'fa-vault', 'fa-piggy-bank', 'fa-credit-card'],
  precio: ['fa-tag', 'fa-tags', 'fa-dollar-sign', 'fa-euro-sign', 'fa-money-bill'],
  cobrar: ['fa-money-bill', 'fa-credit-card', 'fa-coins', 'fa-cash-register'],
  cliente: ['fa-user', 'fa-people-group', 'fa-user-tie', 'fa-handshake', 'fa-people-arrows', 'fa-people-line', 'fa-user-plus', 'fa-people-roof'],
  clientes: ['fa-user', 'fa-people-group', 'fa-user-tie', 'fa-handshake', 'fa-people-arrows', 'fa-people-line', 'fa-user-plus', 'fa-people-roof'],
  usuario: ['fa-user', 'fa-user-tie', 'fa-user-shield', 'fa-user-gear', 'fa-user-pen', 'fa-user-tag', 'fa-user-check', 'fa-user-clock', 'fa-user-plus', 'fa-user-doctor', 'fa-user-nurse', 'fa-user-graduate', 'fa-user-injured', 'fa-user-astronaut', 'fa-people-group'],
  usuarios: ['fa-users', 'fa-users-gear', 'fa-users-slash', 'fa-user-group', 'fa-people-group', 'fa-people-roof'],
  equipo: ['fa-people-group', 'fa-people-roof', 'fa-user-group', 'fa-people-line', 'fa-users', 'fa-handshake', 'fa-user-tie'],
  venta: ['fa-cart-shopping', 'fa-bag-shopping', 'fa-basket-shopping', 'fa-store', 'fa-shop', 'fa-shop-lock', 'fa-cash-register', 'fa-money-bill', 'fa-receipt', 'fa-cart-plus', 'fa-cart-arrow-down', 'fa-truck', 'fa-truck-fast', 'fa-truck-ramp-box'],
  ventas: ['fa-cart-shopping', 'fa-bag-shopping', 'fa-basket-shopping', 'fa-store', 'fa-shop', 'fa-cash-register', 'fa-chart-line', 'fa-chart-pie', 'fa-money-bill-trend-up'],
  carrito: ['fa-cart-shopping', 'fa-cart-plus', 'fa-cart-arrow-down', 'fa-bag-shopping', 'fa-basket-shopping'],
  comprar: ['fa-cart-shopping', 'fa-bag-shopping', 'fa-basket-shopping', 'fa-cart-plus', 'fa-store', 'fa-shop'],
  tienda: ['fa-shop', 'fa-store', 'fa-bag-shopping', 'fa-basket-shopping', 'fa-cart-shopping', 'fa-money-bill'],
  pedido: ['fa-truck', 'fa-truck-fast', 'fa-truck-ramp-box', 'fa-box', 'fa-boxes-packing', 'fa-dolly', 'fa-clipboard-list'],
  marketing: ['fa-bullhorn', 'fa-megaphone', 'fa-ad', 'fa-rectangle-ad', 'fa-magnet', 'fa-paper-plane', 'fa-envelope-open-text', 'fa-share', 'fa-share-from-square', 'fa-share-nodes', 'fa-envelopes-bulk', 'fa-square-poll-horizontal', 'fa-square-poll-vertical', 'fa-chart-line', 'fa-chart-pie', 'fa-magnifying-glass-chart', 'fa-magnifying-glass-dollar', 'fa-magnifying-glass-location', 'fa-person-rays', 'fa-comments-dollar', 'fa-ranking-star'],
  anuncio: ['fa-bullhorn', 'fa-megaphone', 'fa-ad', 'fa-rectangle-ad', 'fa-paper-plane'],
  campana: ['fa-bullhorn', 'fa-megaphone', 'fa-ad', 'fa-rectangle-ad', 'fa-chart-line', 'fa-magnifying-glass-chart'],
  email: ['fa-envelope', 'fa-envelope-open', 'fa-envelope-open-text', 'fa-paper-plane', 'fa-inbox', 'fa-square-envelope', 'fa-envelopes-bulk', 'fa-at'],
  correo: ['fa-envelope', 'fa-envelope-open', 'fa-paper-plane', 'fa-inbox', 'fa-square-envelope', 'fa-at'],
  mensaje: ['fa-comment', 'fa-comments', 'fa-message', 'fa-comment-dots', 'fa-envelope', 'fa-paper-plane', 'fa-square-envelope'],
  chat: ['fa-comment', 'fa-comments', 'fa-message', 'fa-comment-dots', 'fa-comment-nodes', 'fa-comment-medical', 'fa-comment-sms', 'fa-comments-dollar'],
  telefono: ['fa-phone', 'fa-phone-flip', 'fa-phone-volume', 'fa-phone-slash', 'fa-mobile', 'fa-mobile-button', 'fa-mobile-retro', 'fa-mobile-screen', 'fa-mobile-screen-button', 'fa-square-phone', 'fa-square-phone-flip', 'fa-blender-phone', 'fa-walkie-talkie'],
  llamada: ['fa-phone', 'fa-phone-flip', 'fa-phone-volume', 'fa-headset', 'fa-mobile'],
  documento: ['fa-file', 'fa-file-lines', 'fa-folder', 'fa-folder-open', 'fa-note-sticky', 'fa-clipboard', 'fa-file-pdf', 'fa-file-word', 'fa-file-excel', 'fa-file-powerpoint', 'fa-folder-tree'],
  archivo: ['fa-file', 'fa-file-lines', 'fa-folder', 'fa-folder-open', 'fa-box-archive', 'fa-folder-closed'],
  carpeta: ['fa-folder', 'fa-folder-open', 'fa-folder-closed', 'fa-folder-plus', 'fa-folder-minus', 'fa-folder-tree'],
  informe: ['fa-file-lines', 'fa-file-pdf', 'fa-chart-line', 'fa-chart-pie', 'fa-chart-bar', 'fa-chart-area', 'fa-square-poll-horizontal'],
  reporte: ['fa-chart-line', 'fa-chart-pie', 'fa-chart-bar', 'fa-file-lines', 'fa-square-poll-horizontal'],
  calendario: ['fa-calendar', 'fa-calendar-days', 'fa-calendar-check', 'fa-calendar-plus', 'fa-clock', 'fa-stopwatch', 'fa-hourglass-half'],
  fecha: ['fa-calendar', 'fa-calendar-days', 'fa-calendar-check', 'fa-clock', 'fa-stopwatch'],
  hora: ['fa-clock', 'fa-stopwatch', 'fa-hourglass-half', 'fa-hourglass', 'fa-calendar-days'],
  agenda: ['fa-calendar', 'fa-calendar-days', 'fa-calendar-check', 'fa-calendar-plus', 'fa-clipboard-list', 'fa-clipboard'],
  seguridad: ['fa-shield', 'fa-shield-halved', 'fa-shield-alt', 'fa-lock', 'fa-lock-open', 'fa-key', 'fa-user-shield', 'fa-shield-cat', 'fa-shield-dog', 'fa-shield-heart', 'fa-bug', 'fa-eye'],
  seguro: ['fa-shield', 'fa-shield-halved', 'fa-shield-alt', 'fa-lock', 'fa-key', 'fa-user-shield', 'fa-shield-heart'],
  contrasena: ['fa-lock', 'fa-lock-open', 'fa-key', 'fa-shield'],
  clave: ['fa-key', 'fa-lock', 'fa-unlock', 'fa-unlock-keyhole', 'fa-shield'],
  bloqueo: ['fa-lock', 'fa-ban', 'fa-shield', 'fa-circle-xmark', 'fa-xmark'],
  soporte: ['fa-headset', 'fa-life-ring', 'fa-circle-question', 'fa-circle-info', 'fa-handshake-simple', 'fa-phone-volume', 'fa-message', 'fa-comments', 'fa-envelope'],
  ayuda: ['fa-circle-question', 'fa-circle-info', 'fa-handshake-simple', 'fa-life-ring', 'fa-headset', 'fa-question'],
  pregunta: ['fa-circle-question', 'fa-question', 'fa-comments', 'fa-message'],
  info: ['fa-circle-info', 'fa-info', 'fa-circle-question', 'fa-clipboard-question', 'fa-newspaper'],
  configuracion: ['fa-gear', 'fa-cog', 'fa-gears', 'fa-sliders', 'fa-wrench', 'fa-screwdriver-wrench', 'fa-user-gear', 'fa-users-gear'],
  ajustes: ['fa-gear', 'fa-cog', 'fa-gears', 'fa-sliders', 'fa-wrench', 'fa-screwdriver-wrench'],
  preferencias: ['fa-sliders', 'fa-gear', 'fa-cog', 'fa-gears', 'fa-filter'],
  herramienta: ['fa-wrench', 'fa-screwdriver', 'fa-screwdriver-wrench', 'fa-hammer', 'fa-toolbox', 'fa-tools'],
  notificacion: ['fa-bell', 'fa-bell-slash', 'fa-bell-concierge', 'fa-circle-exclamation', 'fa-triangle-exclamation', 'fa-exclamation', 'fa-circle-info'],
  alerta: ['fa-bell', 'fa-circle-exclamation', 'fa-triangle-exclamation', 'fa-exclamation', 'fa-circle-radiation', 'fa-skull-crossbones'],
  aviso: ['fa-bell', 'fa-circle-exclamation', 'fa-triangle-exclamation', 'fa-flag', 'fa-circle-info'],
  analytics: ['fa-chart-line', 'fa-chart-bar', 'fa-chart-pie', 'fa-chart-area', 'fa-chart-simple', 'fa-chart-column', 'fa-chart-gantt', 'fa-tachometer-alt', 'fa-gauge-high', 'fa-gauge-simple', 'fa-magnifying-glass-chart', 'fa-square-poll-horizontal', 'fa-diagram-project'],
  metricas: ['fa-chart-line', 'fa-chart-bar', 'fa-chart-pie', 'fa-square-poll-horizontal', 'fa-tachometer-alt', 'fa-gauge'],
  grafico: ['fa-chart-line', 'fa-chart-bar', 'fa-chart-pie', 'fa-chart-area', 'fa-chart-column', 'fa-chart-simple'],
  estadistica: ['fa-chart-line', 'fa-chart-bar', 'fa-chart-pie', 'fa-chart-area', 'fa-square-poll-horizontal'],
  tecnologia: ['fa-microchip', 'fa-laptop', 'fa-desktop', 'fa-mobile', 'fa-tablet', 'fa-server', 'fa-database', 'fa-code', 'fa-terminal', 'fa-bug', 'fa-cogs', 'fa-memory', 'fa-hard-drive'],
  codigo: ['fa-code', 'fa-code-branch', 'fa-code-commit', 'fa-code-merge', 'fa-code-pull-request', 'fa-code-compare', 'fa-code-fork', 'fa-terminal', 'fa-laptop-code', 'fa-square-binary', 'fa-bug', 'fa-bug-slash', 'fa-cogs'],
  programacion: ['fa-code', 'fa-code-branch', 'fa-code-merge', 'fa-terminal', 'fa-laptop-code', 'fa-bug', 'fa-cogs'],
  servidor: ['fa-server', 'fa-database', 'fa-hard-drive', 'fa-cloud', 'fa-cloud-arrow-up', 'fa-cloud-arrow-down', 'fa-memory'],
  base_de_datos: ['fa-database', 'fa-server', 'fa-hard-drive', 'fa-memory'],
  api: ['fa-code', 'fa-code-branch', 'fa-plug', 'fa-link', 'fa-network-wired', 'fa-server'],
  web: ['fa-globe', 'fa-cloud', 'fa-code', 'fa-link', 'fa-wifi'],
  oficina: ['fa-building', 'fa-building-columns', 'fa-briefcase', 'fa-building-user', 'fa-house-laptop'],
  casa: ['fa-house', 'fa-house-chimney', 'fa-house-laptop', 'fa-house-lock', 'fa-house-user', 'fa-bed', 'fa-couch', 'fa-chair'],
  hotel: ['fa-hotel', 'fa-bed', 'fa-bell-concierge', 'fa-door-open', 'fa-key', 'fa-person-swimming'],
  mapa: ['fa-map', 'fa-map-location', 'fa-map-location-dot', 'fa-map-pin', 'fa-location-dot', 'fa-location-crosshairs', 'fa-location-arrow', 'fa-globe', 'fa-compass', 'fa-compass-drafting'],
  ubicacion: ['fa-location-dot', 'fa-location-crosshairs', 'fa-location-arrow', 'fa-map-pin', 'fa-map', 'fa-compass'],
  direccion: ['fa-location-dot', 'fa-map', 'fa-map-pin', 'fa-compass', 'fa-signs-post'],
  buscar: ['fa-magnifying-glass', 'fa-search', 'fa-binoculars', 'fa-filter', 'fa-magnifying-glass-arrow-right', 'fa-magnifying-glass-location', 'fa-magnifying-glass-chart'],
  enviar: ['fa-paper-plane', 'fa-share', 'fa-share-from-square', 'fa-envelope', 'fa-reply', 'fa-share-nodes'],
  descargar: ['fa-download', 'fa-file-arrow-down', 'fa-cloud-arrow-down', 'fa-file-export', 'fa-file-import'],
  subir: ['fa-upload', 'fa-file-arrow-up', 'fa-cloud-arrow-up', 'fa-share-from-square'],
  eliminar: ['fa-trash', 'fa-trash-can', 'fa-trash-arrow-up', 'fa-trash-can-arrow-up', 'fa-xmark', 'fa-circle-xmark'],
  crear: ['fa-plus', 'fa-circle-plus', 'fa-file-circle-plus', 'fa-square-plus', 'fa-folder-plus', 'fa-pen-to-square', 'fa-pen'],
  editar: ['fa-pen', 'fa-pen-to-square', 'fa-pen-fancy', 'fa-pen-nib', 'fa-edit', 'fa-pen-clip', 'fa-pencil'],
  guardar: ['fa-floppy-disk', 'fa-save', 'fa-file-circle-plus', 'fa-download'],
  cancelar: ['fa-xmark', 'fa-circle-xmark', 'fa-ban', 'fa-rectangle-xmark'],
  confirmar: ['fa-check', 'fa-check-double', 'fa-circle-check', 'fa-square-check'],
  correcto: ['fa-check', 'fa-check-double', 'fa-circle-check', 'fa-square-check', 'fa-thumbs-up'],
  error: ['fa-circle-exclamation', 'fa-triangle-exclamation', 'fa-xmark', 'fa-circle-xmark', 'fa-bug', 'fa-skull-crossbones'],
  advertencia: ['fa-triangle-exclamation', 'fa-circle-exclamation', 'fa-exclamation', 'fa-bell'],
  pendiente: ['fa-hourglass-half', 'fa-hourglass', 'fa-clock', 'fa-stopwatch', 'fa-spinner'],
  completado: ['fa-check', 'fa-check-double', 'fa-circle-check', 'fa-flag-checkered', 'fa-trophy'],
  educacion: ['fa-graduation-cap', 'fa-school', 'fa-book', 'fa-book-open', 'fa-book-open-reader', 'fa-chalkboard', 'fa-chalkboard-user', 'fa-pen-fancy', 'fa-laptop-file', 'fa-user-graduate', 'fa-school-circle-check'],
  curso: ['fa-graduation-cap', 'fa-school', 'fa-book-open', 'fa-laptop-file', 'fa-chalkboard-user'],
  libro: ['fa-book', 'fa-book-open', 'fa-book-open-reader', 'fa-bookmark'],
  articulo: ['fa-newspaper', 'fa-file-lines', 'fa-pen-fancy', 'fa-pen-to-square'],
  envio: ['fa-truck', 'fa-truck-fast', 'fa-truck-ramp-box', 'fa-truck-arrow-right', 'fa-paper-plane', 'fa-plane'],
  transporte: ['fa-truck', 'fa-bus', 'fa-car', 'fa-taxi', 'fa-motorcycle', 'fa-bicycle', 'fa-van-shuttle'],
  salud: ['fa-heart', 'fa-heart-pulse', 'fa-hospital', 'fa-user-doctor', 'fa-user-nurse', 'fa-stethoscope', 'fa-pills', 'fa-tablets', 'fa-suitcase-medical', 'fa-truck-medical'],
  medico: ['fa-user-doctor', 'fa-user-nurse', 'fa-hospital', 'fa-stethoscope', 'fa-pills', 'fa-suitcase-medical', 'fa-hand-holding-medical', 'fa-notes-medical'],
  cita: ['fa-calendar', 'fa-calendar-check', 'fa-calendar-plus', 'fa-clock', 'fa-stopwatch', 'fa-calendar-days'],
  premio: ['fa-trophy', 'fa-award', 'fa-medal', 'fa-star', 'fa-gem', 'fa-crown', 'fa-ribbon'],
  estrella: ['fa-star', 'fa-star-half', 'fa-stars'],
  favorito: ['fa-heart', 'fa-star', 'fa-bookmark', 'fa-thumbs-up'],
  like: ['fa-heart', 'fa-thumbs-up', 'fa-thumbs-down'],
  comentario: ['fa-comment', 'fa-comments', 'fa-comment-dots', 'fa-comment-nodes', 'fa-message'],
  compartir: ['fa-share', 'fa-share-from-square', 'fa-share-nodes', 'fa-paper-plane'],
  mundo: ['fa-globe', 'fa-earth-americas'],
  robot: ['fa-robot', 'fa-microchip', 'fa-cogs'],
  ia: ['fa-robot', 'fa-microchip', 'fa-brain', 'fa-magic', 'fa-cogs'],
  evento: ['fa-calendar', 'fa-calendar-days', 'fa-calendar-check', 'fa-ticket', 'fa-ticket-simple', 'fa-star', 'fa-champagne-glasses'],
  fiesta: ['fa-champagne-glasses', 'fa-cake-candles', 'fa-martini-glass', 'fa-martini-glass-citrus', 'fa-cookie-bite', 'fa-candy-cane', 'fa-gift'],
  regalo: ['fa-gift', 'fa-gifts', 'fa-ribbon', 'fa-box', 'fa-box-open', 'fa-cake-candles'],
  // Body parts (cuerpo humano) - round 2
  ojo: ['fa-eye', 'fa-eye-low-vision', 'fa-eye-slash', 'fa-eye-dropper', 'fa-glasses'],
  ojos: ['fa-eye', 'fa-eye-low-vision', 'fa-eye-slash', 'fa-eye-dropper', 'fa-glasses'],
  vista: ['fa-eye', 'fa-eye-low-vision', 'fa-eye-slash', 'fa-eye-dropper', 'fa-glasses'],
  mirar: ['fa-eye', 'fa-magnifying-glass', 'fa-binoculars'],
  ver: ['fa-eye', 'fa-eye-slash', 'fa-eye-low-vision', 'fa-glasses'],
  mano: ['fa-hand', 'fa-hand-fist', 'fa-hand-back-fist', 'fa-hand-pointer', 'fa-hand-sparkles', 'fa-hand-holding', 'fa-hand-holding-hand', 'fa-hand-holding-heart', 'fa-hand-holding-dollar', 'fa-hand-holding-droplet', 'fa-hand-holding-medical', 'fa-hand-peace', 'fa-hand-scissors', 'fa-hand-spock', 'fa-hand-point-up', 'fa-hand-point-down', 'fa-hand-point-left', 'fa-hand-point-right', 'fa-hand-middle-finger', 'fa-hand-dots', 'fa-hand-lizard', 'fa-hands', 'fa-hands-clapping', 'fa-hands-holding', 'fa-hands-holding-child', 'fa-hands-holding-circle', 'fa-hands-bound', 'fa-hands-bubbles', 'fa-hands-praying', 'fa-handshake', 'fa-handshake-angle', 'fa-handshake-simple', 'fa-handshake-slash', 'fa-thumbs-up', 'fa-thumbs-down'],
  manos: ['fa-hands', 'fa-handshake', 'fa-thumbs-up', 'fa-thumbs-down', 'fa-hands-clapping', 'fa-hands-praying'],
  brazo: ['fa-hand', 'fa-hand-fist', 'fa-thumbs-up', 'fa-thumbs-down', 'fa-hand-point-up', 'fa-hand-point-down', 'fa-hand-point-left', 'fa-hand-point-right', 'fa-hand-back-fist'],
  dedo: ['fa-hand-pointer', 'fa-hand-point-up', 'fa-hand-point-down', 'fa-hand-point-left', 'fa-hand-point-right'],
  cabeza: ['fa-headset', 'fa-brain', 'fa-heading', 'fa-user'],
  boca: ['fa-comment', 'fa-comments', 'fa-comment-dots', 'fa-microphone', 'fa-microphone-lines'],
  oreja: ['fa-ear-deaf', 'fa-ear-listen', 'fa-headphones'],
  oido: ['fa-ear-deaf', 'fa-ear-listen', 'fa-headphones'],
  diente: ['fa-tooth', 'fa-teeth', 'fa-teeth-open'],
  dientes: ['fa-teeth', 'fa-teeth-open', 'fa-tooth'],
  cerebro: ['fa-brain'],
  corazon: ['fa-heart', 'fa-heart-pulse'],
  pies: ['fa-shoe-prints', 'fa-socks'],
  pie: ['fa-shoe-prints', 'fa-socks'],

  // Time (more)
  tiempo: ['fa-clock', 'fa-stopwatch', 'fa-hourglass-half', 'fa-hourglass', 'fa-calendar-days', 'fa-timer'],
  reloj: ['fa-clock', 'fa-stopwatch'],
  cronometro: ['fa-stopwatch', 'fa-clock'],
  en_curso: ['fa-spinner', 'fa-circle-notch', 'fa-arrows-rotate', 'fa-bars-progress', 'fa-bars-staggered', 'fa-hourglass-half'],

  // Vehicles
  coche: ['fa-car', 'fa-car-side', 'fa-car-rear', 'fa-car-burst', 'fa-car-on', 'fa-car-tunnel', 'fa-car-battery', 'fa-van-shuttle', 'fa-taxi', 'fa-truck', 'fa-truck-fast', 'fa-truck-pickup', 'fa-truck-monster', 'fa-truck-field', 'fa-truck-medical', 'fa-truck-ramp-box', 'fa-truck-arrow-right', 'fa-truck-front', 'fa-bus', 'fa-bus-simple', 'fa-van-shuttle', 'fa-shuttle-space', 'fa-taxi', 'fa-motorcycle', 'fa-bicycle'],
  carro: ['fa-car', 'fa-car-side', 'fa-car-rear', 'fa-taxi', 'fa-truck', 'fa-bus'],
  auto: ['fa-car', 'fa-car-side', 'fa-taxi', 'fa-truck', 'fa-bus'],
  taxi: ['fa-taxi', 'fa-car'],
  moto: ['fa-motorcycle'],
  motocicleta: ['fa-motorcycle'],
  bicicleta: ['fa-bicycle'],
  bus: ['fa-bus', 'fa-bus-simple', 'fa-van-shuttle'],
  autobus: ['fa-bus', 'fa-bus-simple'],
  avion: ['fa-plane', 'fa-jet-fighter', 'fa-plane-up', 'fa-plane-arrival', 'fa-plane-departure', 'fa-plane-circle-check', 'fa-plane-circle-exclamation', 'fa-plane-circle-xmark', 'fa-plane-lock', 'fa-shuttle-space', 'fa-jet-fighter-up'],
  barco: ['fa-ship', 'fa-sailboat', 'fa-ferry', 'fa-anchor', 'fa-water'],
  tren: ['fa-train', 'fa-train-subway', 'fa-train-tram'],
  vehiculo: ['fa-car', 'fa-truck', 'fa-bus', 'fa-motorcycle', 'fa-bicycle', 'fa-taxi', 'fa-van-shuttle'],

  // Common objects
  papel: ['fa-note-sticky', 'fa-file', 'fa-file-lines', 'fa-newspaper', 'fa-scroll', 'fa-receipt'],
  sobre: ['fa-envelope', 'fa-envelope-open', 'fa-envelope-open-text', 'fa-square-envelope', 'fa-envelopes-bulk'],
  regla: ['fa-ruler', 'fa-ruler-combined', 'fa-ruler-horizontal', 'fa-ruler-vertical', 'fa-pen-ruler'],
  lupa: ['fa-magnifying-glass', 'fa-magnifying-glass-arrow-right', 'fa-magnifying-glass-location', 'fa-magnifying-glass-chart', 'fa-magnifying-glass-dollar', 'fa-magnifying-glass-minus', 'fa-magnifying-glass-plus', 'fa-search'],
  ventana: ['fa-window-maximize', 'fa-window-minimize', 'fa-window-restore'],
  puerta: ['fa-door-closed', 'fa-door-open'],
  paquete: ['fa-box', 'fa-box-open', 'fa-boxes-packing', 'fa-boxes-stacked', 'fa-box-archive', 'fa-parcel', 'fa-dolly'],
  caja: ['fa-box', 'fa-box-open', 'fa-boxes-packing', 'fa-boxes-stacked', 'fa-box-archive', 'fa-cash-register'],
  bolsa: ['fa-bag-shopping', 'fa-basket-shopping', 'fa-sack-dollar', 'fa-sack-xmark'],
  llave: ['fa-key', 'fa-lock', 'fa-lock-open', 'fa-unlock', 'fa-unlock-keyhole'],
  cuaderno: ['fa-book', 'fa-book-open', 'fa-note-sticky'],
  etiqueta: ['fa-tag', 'fa-tags', 'fa-bookmark'],

  // Media
  imagen: ['fa-image', 'fa-images', 'fa-camera', 'fa-camera-retro', 'fa-photo-film', 'fa-portrait', 'fa-id-card', 'fa-id-card-clip', 'fa-file-image'],
  foto: ['fa-image', 'fa-images', 'fa-camera', 'fa-camera-retro', 'fa-photo-film', 'fa-portrait', 'fa-id-card'],
  video: ['fa-video', 'fa-film', 'fa-file-video', 'fa-photo-film', 'fa-tv', 'fa-circle-play', 'fa-circle-pause', 'fa-play', 'fa-pause', 'fa-clapperboard'],
  pelicula: ['fa-film', 'fa-clapperboard', 'fa-photo-film', 'fa-file-video'],
  audio: ['fa-volume-high', 'fa-volume-low', 'fa-volume-off', 'fa-volume-xmark', 'fa-microphone', 'fa-microphone-lines', 'fa-microphone-lines-slash', 'fa-microphone-slash', 'fa-headphones', 'fa-music', 'fa-podcast', 'fa-tower-broadcast', 'fa-file-audio'],
  musica: ['fa-music', 'fa-headphones', 'fa-drum', 'fa-drum-steelpan', 'fa-guitar', 'fa-record-vinyl', 'fa-compact-disc', 'fa-file-audio', 'fa-file-mp3', 'fa-file-mp4'],
  cancion: ['fa-music', 'fa-file-audio', 'fa-compact-disc'],
  sonido: ['fa-volume-high', 'fa-volume-low', 'fa-volume-off', 'fa-music', 'fa-bell', 'fa-bell-slash', 'fa-microphone'],

  // IT / tech
  software: ['fa-microchip', 'fa-laptop-code', 'fa-code', 'fa-terminal', 'fa-bug', 'fa-cogs'],
  hardware: ['fa-microchip', 'fa-memory', 'fa-hard-drive', 'fa-server', 'fa-cpu', 'fa-laptop', 'fa-desktop', 'fa-mobile', 'fa-tablet'],
  programa: ['fa-laptop-code', 'fa-code', 'fa-code-branch', 'fa-terminal', 'fa-microchip', 'fa-robot'],
  aplicacion: ['fa-mobile', 'fa-mobile-screen', 'fa-mobile-screen-button', 'fa-tablet', 'fa-tablet-screen-button', 'fa-puzzle-piece'],
  app: ['fa-mobile', 'fa-mobile-screen', 'fa-mobile-screen-button', 'fa-tablet', 'fa-puzzle-piece'],
  red: ['fa-network-wired', 'fa-globe', 'fa-wifi', 'fa-server', 'fa-diagram-project', 'fa-sitemap', 'fa-share-nodes', 'fa-circle-nodes', 'fa-ethernet', 'fa-cloud'],
  internet: ['fa-globe', 'fa-wifi', 'fa-cloud', 'fa-network-wired', 'fa-ethernet', 'fa-server'],
  base_datos: ['fa-database', 'fa-server', 'fa-hard-drive', 'fa-memory'],
  nube: ['fa-cloud', 'fa-cloud-arrow-up', 'fa-cloud-arrow-down', 'fa-cloud-meatball', 'fa-cloud-bolt', 'fa-cloud-moon', 'fa-cloud-rain', 'fa-cloud-showers-heavy', 'fa-cloud-sun', 'fa-cloudscale', 'fa-cloudsmith', 'fa-cloudversify'],
  firewall: ['fa-shield', 'fa-fire-extinguisher', 'fa-shield-halved', 'fa-user-shield'],
  ciberseguridad: ['fa-shield', 'fa-shield-halved', 'fa-bug', 'fa-virus', 'fa-user-shield', 'fa-lock', 'fa-key', 'fa-bug-slash', 'fa-shield-virus'],

  // Money (more)
  efectivo: ['fa-money-bill', 'fa-coins', 'fa-wallet', 'fa-dollar-sign', 'fa-euro-sign'],
  tarjeta: ['fa-credit-card', 'fa-money-bill', 'fa-wallet'],
  banco: ['fa-building-columns', 'fa-landmark', 'fa-landmark-dome', 'fa-landmark-flag', 'fa-vault', 'fa-money-bill-transfer', 'fa-piggy-bank'],
  transferencia: ['fa-money-bill-transfer', 'fa-right-left', 'fa-arrows-left-right', 'fa-share-from-square'],
  presupuesto: ['fa-file-invoice', 'fa-file-invoice-dollar', 'fa-file-contract', 'fa-file-lines', 'fa-money-bill', 'fa-receipt'],
  cotizacion: ['fa-file-invoice', 'fa-file-invoice-dollar', 'fa-file-contract', 'fa-quote-left', 'fa-quote-right'],
  cotizaciones: ['fa-file-invoice', 'fa-file-invoice-dollar', 'fa-file-contract', 'fa-quote-left', 'fa-quote-right'],
  invoice: ['fa-file-invoice', 'fa-file-invoice-dollar', 'fa-receipt', 'fa-money-bill'],
  recibo: ['fa-receipt', 'fa-file-invoice', 'fa-money-bill', 'fa-file-invoice-dollar'],
  ingresos: ['fa-money-bill-trend-up', 'fa-money-bill', 'fa-coins', 'fa-arrow-trend-up', 'fa-chart-line', 'fa-chart-pie', 'fa-money-bills', 'fa-sack-dollar'],
  gastos: ['fa-money-bill-trend-down', 'fa-money-bill', 'fa-arrow-trend-down', 'fa-receipt', 'fa-money-bill-wave', 'fa-credit-card'],
  ganancia: ['fa-money-bill-trend-up', 'fa-arrow-trend-up', 'fa-sack-dollar', 'fa-money-bill', 'fa-chart-line'],

  // Common actions
  abrir: ['fa-folder-open', 'fa-door-open', 'fa-window-maximize', 'fa-unlock', 'fa-unlock-keyhole', 'fa-up-right-from-square', 'fa-external-link'],
  cerrar: ['fa-folder', 'fa-folder-closed', 'fa-door-closed', 'fa-window-restore', 'fa-lock', 'fa-power-off', 'fa-circle-xmark', 'fa-xmark', 'fa-ban'],
  actualizar: ['fa-arrows-rotate', 'fa-rotate', 'fa-rotate-left', 'fa-rotate-right', 'fa-arrows-spin', 'fa-redo', 'fa-circle-info'],
  recargar: ['fa-arrows-rotate', 'fa-rotate', 'fa-redo', 'fa-undo'],
  sincronizar: ['fa-arrows-rotate', 'fa-arrows-spin', 'fa-rotate'],
  copiar: ['fa-copy', 'fa-paste', 'fa-clone', 'fa-files'],
  pegar: ['fa-paste', 'fa-copy', 'fa-clipboard'],
  mover: ['fa-arrows-up-down-left-right', 'fa-up-down-left-right', 'fa-arrows-up-down', 'fa-up-down', 'fa-left-right', 'fa-arrows-left-right', 'fa-truck', 'fa-dolly'],
  importar: ['fa-file-import', 'fa-file-arrow-up', 'fa-cloud-arrow-up', 'fa-upload'],
  exportar: ['fa-file-export', 'fa-file-arrow-down', 'fa-cloud-arrow-down', 'fa-download', 'fa-share-from-square', 'fa-share'],
  imprimir: ['fa-print'],
  escanear: ['fa-print', 'fa-qrcode', 'fa-barcode', 'fa-magnifying-glass'],
  firmar: ['fa-signature', 'fa-pen-fancy', 'fa-pen-nib', 'fa-file-contract'],
  login: ['fa-arrow-right-to-bracket', 'fa-arrow-right-from-bracket', 'fa-user-plus', 'fa-user-check', 'fa-user-shield', 'fa-key', 'fa-lock', 'fa-unlock'],
  logout: ['fa-arrow-right-from-bracket', 'fa-power-off', 'fa-user-slash', 'fa-users-slash'],
  registrarse: ['fa-user-plus', 'fa-user-check', 'fa-arrow-right-to-bracket', 'fa-id-card', 'fa-id-card-clip'],
  iniciar_sesion: ['fa-arrow-right-to-bracket', 'fa-key', 'fa-user-check', 'fa-user-shield'],
  cerrar_sesion: ['fa-arrow-right-from-bracket', 'fa-power-off', 'fa-user-slash'],

  // Status / quality
  aprobado: ['fa-check', 'fa-check-double', 'fa-circle-check', 'fa-thumbs-up', 'fa-badge-check', 'fa-trophy', 'fa-medal'],
  rechazado: ['fa-xmark', 'fa-circle-xmark', 'fa-ban', 'fa-rectangle-xmark', 'fa-thumbs-down', 'fa-circle-minus'],
  en_progreso: ['fa-spinner', 'fa-circle-notch', 'fa-arrows-rotate', 'fa-bars-progress', 'fa-bars-staggered', 'fa-hourglass-half'],
  archivado: ['fa-box-archive', 'fa-folder', 'fa-folder-closed'],
  eliminado: ['fa-trash', 'fa-trash-can', 'fa-trash-arrow-up', 'fa-trash-can-arrow-up', 'fa-xmark', 'fa-circle-xmark'],

  // Other useful
  lupa_busqueda: ['fa-magnifying-glass', 'fa-search', 'fa-binoculars', 'fa-magnifying-glass-arrow-right', 'fa-magnifying-glass-location', 'fa-magnifying-glass-chart'],
  estrella_fugaz: ['fa-star', 'fa-sparkles', 'fa-wand-sparkles', 'fa-wand-magic-sparkles', 'fa-star-of-david'],
  agendar: ['fa-calendar-plus', 'fa-calendar-check', 'fa-clock', 'fa-stopwatch', 'fa-bell-concierge', 'fa-clipboard-list'],
  reserva: ['fa-bookmark', 'fa-calendar-check', 'fa-ticket', 'fa-ticket-simple', 'fa-calendar-days', 'fa-bell-concierge'],
  cita_medica: ['fa-calendar', 'fa-calendar-check', 'fa-calendar-plus', 'fa-clock', 'fa-stopwatch', 'fa-calendar-days', 'fa-handshake', 'fa-user-doctor', 'fa-user-nurse'],

};

/**
 * Accent-stripped lower-case for accent-insensitive substring matching
 * (e.g. "facturación" matches "facturacion").
 */
export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
