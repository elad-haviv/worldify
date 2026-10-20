import React from 'react';
import { EntityCategory } from '../types/worldify';
import { CATEGORY_META } from '../utils/categories';
import { CATEGORY_ICONS } from '../utils/categoryIcons';

/** Coloured rounded square with the category's icon. */
export const CategoryIcon: React.FC<{ category: EntityCategory; size?: 'sm' | 'md' | 'lg' }> = ({ category, size = 'md' }) => {
  const Icon = CATEGORY_ICONS[category];
  const color = CATEGORY_META[category]?.color ?? '#94a3b8';
  const box = size === 'sm' ? 'w-5 h-5 rounded' : size === 'lg' ? 'w-9 h-9 rounded-lg' : 'w-7 h-7 rounded-md';
  const icon = size === 'sm' ? 'w-3 h-3' : size === 'lg' ? 'w-5 h-5' : 'w-4 h-4';
  return (
    <span
      className={`${box} shrink-0 flex items-center justify-center`}
      style={{ backgroundColor: `${color}22`, color, boxShadow: `inset 0 0 0 1px ${color}40` }}
    >
      {Icon && <Icon className={icon} />}
    </span>
  );
};
