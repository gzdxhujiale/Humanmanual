import React, { useState, useRef, TouchEvent } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { triggerHaptic } from '../../lib/haptics';
import './SwipeableItem.css';

interface SwipeableItemProps {
  children: React.ReactNode;
  onSwipeRight?: () => void; // 右划动作 (如完成)
  onSwipeLeft?: () => void;  // 左划动作 (如删除)
  rightLabel?: string;
  leftLabel?: string;
  disabled?: boolean;
}

const SWIPE_THRESHOLD = 80;

export const SwipeableItem: React.FC<SwipeableItemProps> = ({
  children,
  onSwipeRight,
  onSwipeLeft,
  rightLabel = '完成',
  leftLabel = '删除',
  disabled = false,
}) => {
  const [translateX, setTranslateX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const startXRef = useRef<number>(0);
  const startYRef = useRef<number>(0);
  const isHorizontalSwipeRef = useRef<boolean | null>(null);

  const handleTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    if (disabled) return;
    const touch = e.touches[0];
    startXRef.current = touch.clientX;
    startYRef.current = touch.clientY;
    isHorizontalSwipeRef.current = null;
    setIsSwiping(true);
  };

  const handleTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    if (disabled || !isSwiping) return;
    const touch = e.touches[0];
    const diffX = touch.clientX - startXRef.current;
    const diffY = touch.clientY - startYRef.current;

    // 锁定滑动方向：若纵向滚动大于横向，放弃滑动手势
    if (isHorizontalSwipeRef.current === null) {
      if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 8) {
        isHorizontalSwipeRef.current = true;
      } else if (Math.abs(diffY) > 8) {
        isHorizontalSwipeRef.current = false;
      }
    }

    if (isHorizontalSwipeRef.current === true) {
      // 抑制右划或左划若未提供对应 handler
      if (diffX > 0 && !onSwipeRight) return;
      if (diffX < 0 && !onSwipeLeft) return;

      // 带阻尼系数的平滑滚动
      const maxDistance = 120;
      const clampedX = Math.max(-maxDistance, Math.min(maxDistance, diffX));
      setTranslateX(clampedX);

      // 触及阈值时触发单次轻微震动
      if (Math.abs(diffX) >= SWIPE_THRESHOLD && Math.abs(translateX) < SWIPE_THRESHOLD) {
        triggerHaptic('medium');
      }
    }
  };

  const handleTouchEnd = () => {
    if (!isSwiping) return;
    setIsSwiping(false);

    if (translateX >= SWIPE_THRESHOLD && onSwipeRight) {
      triggerHaptic('success');
      onSwipeRight();
    } else if (translateX <= -SWIPE_THRESHOLD && onSwipeLeft) {
      triggerHaptic('warning');
      onSwipeLeft();
    }

    // 复位
    setTranslateX(0);
    isHorizontalSwipeRef.current = null;
  };

  return (
    <div className="swipeable-item-wrapper">
      {/* 右划出现的左侧背景区域（完成） */}
      {onSwipeRight && translateX > 0 && (
        <div className="swipe-action-bg swipe-action-right" style={{ opacity: Math.min(1, translateX / SWIPE_THRESHOLD) }}>
          <Check size={18} />
          <span>{rightLabel}</span>
        </div>
      )}

      {/* 左划出现的右侧背景区域（删除） */}
      {onSwipeLeft && translateX < 0 && (
        <div className="swipe-action-bg swipe-action-left" style={{ opacity: Math.min(1, Math.abs(translateX) / SWIPE_THRESHOLD) }}>
          <span>{leftLabel}</span>
          <Trash2 size={18} />
        </div>
      )}

      {/* 滑动卡片本体 */}
      <div
        className="swipeable-item-content"
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isSwiping ? 'none' : 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
};
