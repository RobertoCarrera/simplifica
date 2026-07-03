const fs = require('fs');
const p = 'src/app/features/admin/modules/modules-admin.component.ts';
let s = fs.readFileSync(p, 'utf8');
// Improve the FA→Lucide map to fix all common icons
const old = `  /** Convert a FA class name to a Lucide icon name. Strips 'fa-' prefix and
   *  strips common FA suffixes ('-solid', '-regular', '-brands', '-light').
   *  Examples: 'fa-house' → 'home', 'fa-bullhorn' → 'megaphone'. */
  getLucideName(faClass: string): string {
    if (!faClass) return 'package';
    let name = faClass.replace(/^fa-/, '').replace(/-solid$|-regular$|-brands$|-light$/, '');
    // Common FA→Lucide overrides
    const map: Record<string, string> = {
      'cogs': 'settings',
      'gear': 'settings',
      'file-invoice-dollar': 'receipt',
      'bullhorn': 'megaphone',
      'mobile-screen': 'smartphone',
      'mobile-screen-button': 'smartphone',
      'puzzle-piece': 'puzzle',
      'graduation-cap': 'graduation-cap',
      'comments': 'message-circle',
      'shield-halved': 'shield',
      'envelope': 'mail',
      'shop': 'shopping-bag',
      'envelope-open': 'mail-open',
    };
    return map[name] || name;
  }`;
const repl = `  /** Convert a FA class name to a Lucide icon name. Strips 'fa-' prefix and
   *  strips common FA suffixes ('-solid', '-regular', '-brands', '-light').
   *  Examples: 'fa-house' → 'home', 'fa-bullhorn' → 'megaphone'. */
  getLucideName(faClass: string): string {
    if (!faClass) return 'package';
    let name = faClass.replace(/^fa-/, '').replace(/-solid$|-regular$|-brands$|-light$/, '');
    // Common FA→Lucide overrides
    const map: Record<string, string> = {
      'house': 'home', 'home': 'home', 'building': 'building', 'store': 'store',
      'briefcase': 'briefcase', 'hospital': 'hospital', 'school': 'school',
      'university': 'university', 'cogs': 'settings', 'gear': 'settings',
      'gears': 'settings', 'tools': 'wrench', 'wrench': 'wrench', 'hammer': 'hammer',
      'screwdriver': 'screwdriver', 'screwdriver-wrench': 'screwdriver-wrench',
      'toolbox': 'toolbox', 'wrench': 'wrench', 'file-invoice': 'receipt',
      'file-invoice-dollar': 'receipt', 'receipt': 'receipt', 'wallet': 'wallet',
      'credit-card': 'credit-card', 'money-bill': 'banknote', 'coins': 'coins',
      'bullhorn': 'megaphone', 'megaphone': 'megaphone', 'bell': 'bell',
      'bell-slash': 'bell-off', 'envelope': 'mail', 'envelope-open': 'mail-open',
      'inbox': 'inbox', 'comment': 'message-circle', 'comment-dots': 'message-circle',
      'comment-alt': 'message-circle', 'comments': 'message-circle',
      'message-circle': 'message-circle', 'message-square': 'message-square',
      'mobile-screen': 'smartphone', 'mobile-screen-button': 'smartphone',
      'mobile': 'smartphone', 'mobile-alt': 'smartphone', 'tablet': 'tablet',
      'tablet-screen-button': 'tablet', 'tablet-alt': 'tablet', 'laptop': 'laptop',
      'desktop': 'monitor', 'puzzle-piece': 'puzzle', 'puzzle': 'puzzle',
      'graduation-cap': 'graduation-cap', 'book-open': 'book-open',
      'book': 'book', 'user': 'user', 'users': 'users', 'user-tie': 'user-tie',
      'calendar': 'calendar', 'calendar-days': 'calendar-days',
      'calendar-check': 'calendar-check-2', 'clock': 'clock',
      'shield-halved': 'shield', 'shield-alt': 'shield', 'shield': 'shield',
      'shield-check': 'shield-check', 'lock': 'lock', 'key': 'key',
      'tag': 'tag', 'star': 'star', 'heart': 'heart', 'chart-line': 'trending-up',
      'chart-bar': 'bar-chart-3', 'chart-pie': 'pie-chart',
      'tachometer': 'gauge', 'cog': 'settings', 'sliders': 'sliders-horizontal',
      'search': 'search', 'filter': 'filter', 'magic': 'wand-sparkles',
      'wand-sparkles': 'wand-sparkles', 'rocket': 'rocket', 'flame': 'flame',
      'fire': 'flame', 'bolt': 'zap', 'lightning-bolt': 'zap', 'crown': 'crown',
      'gem': 'gem', 'medal': 'medal', 'trophy': 'trophy', 'gift': 'gift',
      'cart-shopping': 'shopping-cart', 'shopping-bag': 'shopping-bag',
      'shopping-cart': 'shopping-cart', 'box-open': 'package-open',
      'box': 'package', 'box': 'package', 'cubes': 'package-2',
      'pallet': 'package-2', 'warehouse': 'warehouse', 'factory': 'factory',
      'truck': 'truck', 'car': 'car', 'plane': 'plane', 'ship': 'ship',
      'train': 'train', 'bus': 'bus', 'taxi': 'taxi', 'bike': 'bike',
      'bicycle': 'bike', 'map': 'map', 'map-pin': 'map-pin',
      'map-marker': 'map-pin', 'compass': 'compass', 'flag': 'flag',
      'sun': 'sun', 'moon': 'moon', 'cloud': 'cloud', 'cloud-rain': 'cloud-rain',
      'cloud-sun': 'cloud-sun', 'cloud-moon': 'cloud-moon', 'umbrella': 'umbrella',
      'wind': 'wind', 'snowflake': 'snowflake', 'fire-extinguisher': 'fire-extinguisher',
      'thermometer': 'thermometer', 'leaf': 'leaf', 'tree': 'tree-pine',
      'tree-pine': 'tree-pine', 'flower': 'flower', 'sprout': 'sprout',
      'cannabis': 'cannabis', 'seedling': 'sprout', 'gamepad': 'gamepad-2',
      'puzzle': 'puzzle', 'trophy': 'trophy', 'award': 'award',
      'gem': 'gem', 'crown': 'crown', 'coffee': 'coffee', 'mug': 'coffee',
      'mug-hot': 'coffee', 'tea': 'coffee', 'beer': 'beer', 'wine': 'wine',
      'martini': 'martini', 'droplet': 'droplet', 'glass-water': 'glass-water',
      'ice-cream': 'ice-cream', 'pizza': 'pizza', 'burger': 'burger',
      'sandwich': 'sandwich', 'hotdog': 'hotdog', 'cake': 'cake', 'cookie': 'cookie',
      'candy': 'candy', 'meat': 'drumstick', 'drumstick': 'drumstick',
      'utensils': 'utensils', 'fork-knife': 'utensils', 'fork': 'utensils',
      'knife': 'utensils', 'spoon': 'utensils', 'cup-soda': 'cup-soda',
      'mug-soup': 'soup', 'bowl-food': 'soup', 'plate-wheat': 'wheat',
      'wheat': 'wheat', 'rice': 'rice', 'noodles': 'utensils',
      'soup': 'soup', 'pretzel': 'pretzel', 'candy-cane': 'candy',
      'lollipop': 'candy', 'mug-spa': 'spa', 'spa': 'spa', 'dice': 'dice-5',
      'fingerprint': 'fingerprint', 'qrcode': 'qr-code', 'barcode': 'barcode',
      'scan-face': 'scan-face', 'scan-line': 'scan-line', 'scan': 'scan',
      'lock-keyhole': 'lock-keyhole', 'unlock-keyhole': 'unlock-keyhole',
      'eye': 'eye', 'eye-off': 'eye-off', 'eye-dropper': 'eye-dropper',
      'trash-2': 'trash-2', 'trash': 'trash-2', 'archive': 'archive',
      'archive-restore': 'archive-restore', 'inbox': 'inbox', 'send': 'send',
      'paper-plane': 'send', 'reply': 'reply', 'reply-all': 'reply-all',
      'forward': 'forward', 'share': 'share-2', 'share-2': 'share-2',
      'link': 'link', 'link-2': 'link-2', 'external-link': 'external-link',
      'at': 'at-sign', 'at-sign': 'at-sign', 'hash': 'hash', 'percent': 'percent',
      'plus': 'plus', 'minus': 'minus', 'equals': 'equals', 'divide': 'divide',
      'xmark': 'x', 'times': 'x', 'check': 'check', 'check-circle': 'check-circle',
      'check-square': 'square-check', 'info': 'info', 'info-circle': 'info',
      'exclamation': 'alert-circle', 'exclamation-circle': 'alert-circle',
      'exclamation-triangle': 'triangle-alert', 'question': 'help-circle',
      'question-circle': 'help-circle', 'warning': 'triangle-alert',
      'bell': 'bell', 'bell-slash': 'bell-off', 'volume': 'volume',
      'volume-1': 'volume-1', 'volume-2': 'volume-2', 'volume-x': 'volume-x',
      'volume-off': 'volume-off', 'play': 'play', 'pause': 'pause',
      'stop': 'square', 'skip-back': 'skip-back', 'skip-forward': 'skip-forward',
      'rewind': 'rewind', 'fast-forward': 'fast-forward', 'shuffle': 'shuffle',
      'repeat': 'repeat', 'music': 'music', 'phone': 'phone',
      'phone-off': 'phone-off', 'phone-call': 'phone-call',
      'voicemail': 'voicemail', 'headphones': 'headphones', 'mic': 'mic',
      'mic-off': 'mic-off', 'camera': 'camera', 'camera-off': 'camera-off',
      'webcam': 'webcam', 'video': 'video', 'video-off': 'video-off',
      'tv': 'tv', 'monitor': 'monitor', 'printer': 'printer', 'keyboard': 'keyboard',
      'mouse': 'mouse', 'mouse-pointer': 'mouse-pointer-click',
      'calculator': 'calculator', 'watch': 'watch', 'gem': 'gem',
      'medal': 'medal', 'trophy': 'trophy', 'award': 'award', 'crown': 'crown
