const fs = require('fs');
const path = require('path');

const filePath = path.join('src', 'app', 'components', 'supabase-services', 'supabase-services.component.scss');

try {
    let content = fs.readFileSync(filePath, 'utf8');

    function replaceBlock(content, selector, newCss) {
        const escapedSelector = selector.replace(/[.*+?^${}()|[\]\]/g, '\$&');
        const regex = new RegExp('^' + escapedSelector + '\s*\{', 'm');
        const match = regex.exec(content);

        if (!match) {
            console.log(`Could not find top-level block for selector: ${selector}`);
            return content;
        }

        const startIndex = match.index;
        const openBraceIndex = startIndex + match[0].length - 1;

        let balance = 1;
        let i = openBraceIndex + 1;
        while (i < content.length && balance > 0) {
            if (content[i] === '{') balance++;
            else if (content[i] === '}') balance--;
            i++;
        }

        if (balance !== 0) {
            console.log(`Could not find matching closing brace for selector: ${selector}`);
            return content;
        }

        const endIndex = i;
        console.log(`Replacing top-level block for ${selector}`);
        return content.substring(0, startIndex) + newCss + content.substring(endIndex);
    }

    const newModalHeader = `.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 28px;
  border-bottom: 1px solid #e5e7eb;
  background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, #3b82f6 0%, #8b5cf6 50%, #10b981 100%);
  }

  h2 {
    margin: 0;
    font-size: 1.75rem;
    font-weight: 700;
    color: #1f2937;
    letter-spacing: -0.025em;
    display: flex;
    align-items: center;
    gap: 12px;
  }
}`;

    const newCloseBtn = `.close-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: #f3f4f6;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  transition: all 0.2s ease;
  font-size: 1.1rem;

  &:hover {
    background: #dc2626;
    color: white;
    transform: rotate(90deg) scale(1.1);
  }

  &:active {
    transform: rotate(90deg) scale(0.95);
  }
}`;

    const newBtnIcon = `.btn-icon {
  width: 52px;
  height: 52px;
  min-width: 52px;
  min-height: 52px;
  border-radius: 50%;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  font-size: 1.35rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0;
    height: 0;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.3);
    transform: translate(-50%, -50%);
    transition: width 0.4s, height 0.4s;
  }

  &:hover::before {
    width: 100px;
    height: 100px;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    box-shadow: none;
  }

  &.btn-cancel {
    background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%);
    color: white;

    &:hover:not(:disabled) {
      background: linear-gradient(135deg, #4b5563 0%, #374151 100%);
      transform: translateY(-2px) scale(1.05);
      box-shadow: 0 4px 16px rgba(75, 85, 99, 0.4);
    }

    &:active:not(:disabled) {
      transform: translateY(0) scale(1.02);
    }

    @media (prefers-color-scheme: dark) {
      background: linear-gradient(135deg, #4b5563 0%, #374151 100%);

      &:hover:not(:disabled) {
        background: linear-gradient(135deg, #374151 0%, #1f2937 100%);
        box-shadow: 0 4px 16px rgba(31, 41, 55, 0.6);
      }
    }
  }

  &.btn-save {
    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
    color: white;

    &:hover:not(:disabled) {
      background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
      transform: translateY(-2px) scale(1.05);
      box-shadow: 0 4px 16px rgba(37, 99, 235, 0.5);
      animation: pulse 1.5s infinite;
    }

    &:active:not(:disabled) {
      transform: translateY(0) scale(1.02);
    }

    @media (prefers-color-scheme: dark) {
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);

      &:hover:not(:disabled) {
        background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%);
        box-shadow: 0 4px 16px rgba(59, 130, 246, 0.6);
      }
    }
  }
}`;

    const newAccordionSection = `.accordion-section {
  border: none;
  border-bottom: 1px solid #e5e7eb;
  border-radius: 0;
  margin-bottom: 0;
  overflow: visible;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: #f9fafb;
  }
}`;

    const newAccordionHeader = `.accordion-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 0;
  background: transparent;
  cursor: pointer;
  user-select: none;
  transition: all 0.2s ease;
  border-radius: 0;

  &:hover {
    background: transparent;
    
    .accordion-title i {
      transform: scale(1.1);
    }
  }

  &.active {
    background: transparent;
    border-bottom: none;
    padding-bottom: 16px;
  }

  i.fa-chevron-down,
  i.fa-chevron-up {
    color: #6b7280;
    font-size: 0.9rem;
    transition: all 0.3s ease;
    font-weight: 400;
  }

  &.active i.fa-chevron-up {
    color: #3b82f6;
  }
}`;

    const newAccordionTitle = `.accordion-title {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 1.1rem;
  font-weight: 700;
  color: #1f2937;
  letter-spacing: -0.01em;

  i {
    font-size: 1.25rem;
    transition: transform 0.3s ease;
  }

  &:has(.fa-info-circle) i {
    color: #3b82f6;
  }

  &:has(.fa-layer-group) i {
    color: #8b5cf6;
  }

  &:has(.fa-euro-sign) i {
    color: #10b981;
  }

  &:has(.fa-clock) i {
    color: #f59e0b;
  }

  &:has(.fa-cogs) i {
    color: #ef4444;
  }

  .badge-new {
    font-size: 0.75rem;
    font-weight: 600;
    padding: 4px 12px;
    background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
    color: #92400e;
    border-radius: 9999px;
    margin-left: 8px;
    box-shadow: 0 2px 4px rgba(146, 64, 14, 0.2);
    animation: scaleIn 0.3s ease;
  }
}

@keyframes scaleIn {
  from {
    transform: scale(0);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}`;

    const newAccordionContent = `.accordion-content {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1), padding 0.3s ease;
  background: white;

  &.expanded {
    max-height: 3000px;
    padding: 0 0 24px 0;
    overflow: visible;
    animation: slideDown 0.3s ease;
  }
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}`;

    const newTagChip = `.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  padding: 8px 14px;
  border-radius: 20px;
  font-size: 0.85rem;
  font-weight: 600;
  transition: all 0.2s ease;
  box-shadow: 0 2px 6px rgba(59, 130, 246, 0.3);
  animation: scaleIn 0.2s ease;

  &:hover {
    background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4);
  }

  .tag-remove {
    background: none;
    border: none;
    color: white;
    cursor: pointer;
    padding: 0;
    margin: 0;
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: all 0.2s ease;

    &:hover {
      background: rgba(255, 255, 255, 0.3);
      transform: rotate(90deg) scale(1.2);
    }

    i {
      font-size: 0.75rem;
    }
  }
}`;

    content = replaceBlock(content, '.modal-header', newModalHeader);
    content = replaceBlock(content, '.c
