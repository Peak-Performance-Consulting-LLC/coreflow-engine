import { motion, useReducedMotion, type Variants } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

type RevealDirection = 'up' | 'down' | 'left' | 'right';

function createRevealVariants(direction: RevealDirection, distance: number, reduceMotion: boolean): Variants {
  if (reduceMotion) {
    return {
      hidden: { opacity: 0 },
      visible: { opacity: 1, transition: { duration: 0.2 } },
    };
  }

  const axisOffset =
    direction === 'up'
      ? { y: distance }
      : direction === 'down'
        ? { y: -distance }
        : direction === 'left'
          ? { x: distance }
          : { x: -distance };

  return {
    hidden: { opacity: 0, ...axisOffset, scale: 0.985, filter: 'blur(6px)' },
    visible: {
      opacity: 1,
      x: 0,
      y: 0,
      scale: 1,
      filter: 'blur(0px)',
      transition: { duration: 0.58, ease: [0.22, 1, 0.36, 1] },
    },
  };
}

interface LandingRevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  direction?: RevealDirection;
  distance?: number;
  once?: boolean;
  amount?: number;
}

interface LandingStaggerProps {
  children: ReactNode;
  className?: string;
  stagger?: number;
  delayChildren?: number;
  once?: boolean;
  amount?: number;
}

interface LandingRevealItemProps {
  children: ReactNode;
  className?: string;
  direction?: RevealDirection;
  distance?: number;
}

const staggerContainerVariants: Variants = {
  hidden: {},
  visible: {},
};

export function LandingReveal({
  children,
  className,
  delay = 0,
  direction = 'up',
  distance = 22,
  once = true,
  amount = 0.2,
}: LandingRevealProps) {
  const reduceMotion = useReducedMotion();
  const revealVariants = createRevealVariants(direction, distance, Boolean(reduceMotion));

  return (
    <motion.div
      className={cn(className)}
      variants={revealVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, amount }}
      transition={{ delay }}
    >
      {children}
    </motion.div>
  );
}

export function LandingStagger({
  children,
  className,
  stagger = 0.08,
  delayChildren = 0,
  once = true,
  amount = 0.15,
}: LandingStaggerProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className={cn(className)}
      variants={staggerContainerVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, amount }}
      transition={reduceMotion ? undefined : { staggerChildren: stagger, delayChildren }}
    >
      {children}
    </motion.div>
  );
}

export function LandingRevealItem({
  children,
  className,
  direction = 'up',
  distance = 20,
}: LandingRevealItemProps) {
  const reduceMotion = useReducedMotion();
  const revealVariants = createRevealVariants(direction, distance, Boolean(reduceMotion));

  return (
    <motion.div className={cn(className)} variants={revealVariants}>
      {children}
    </motion.div>
  );
}
