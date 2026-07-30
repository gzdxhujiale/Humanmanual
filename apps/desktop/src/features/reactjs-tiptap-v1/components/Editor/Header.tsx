import { useEffect } from 'react';

import { localeActions } from 'reactjs-tiptap-editor/locale-bundle';

import { Button } from '../ui/button';
import { Label } from '../ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../ui/popover';
import useLocalStorageState from '../../hooks/ahooks/useLocalStorageState';
import { Check, Moon, Sun, SwatchBook } from 'lucide-react';
import { themeActions } from 'reactjs-tiptap-editor/theme';

const GithubIcon = ({ size = 20, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

const ColorIcon = ({ color, active }: { color: string; active: boolean }) => {
  if (active) {
    return (
      <span
        className={`inline-flex items-center justify-center size-[20px] rounded-full  bg-black`}
      >
        <Check size={16} className="text-white" />
      </span>
    );
  }

  return (
    <span
      className={`inline-block size-[20px] rounded-full`}
      style={{
        backgroundColor: color,
      }}
    ></span>
  );
};

export const Header = () => {
  const [theme, setTheme] = useLocalStorageState('next-tiptap-theme', {
    defaultValue: 'light',
    listenStorageChange: true,
  });

  const [color, setColor] = useLocalStorageState('next-tiptap-color', {
    defaultValue: 'default',
    listenStorageChange: true,
  });

  const [radius, setRadius] = useLocalStorageState('next-tiptap-radius', {
    defaultValue: 0.5,
    listenStorageChange: true,
  });

  useEffect(() => {
    themeActions.setTheme((theme as any) || 'light');
    themeActions.setColor((color as any) || 'default');
    themeActions.setBorderRadius(`${radius}rem` || '0.5rem');
    localeActions.setLang('zh_CN');
  }, []);

  return (
    <div className="flex items-center justify-between sticky top-0 z-10 ">
      <h1 className="text-[24px] font-bold leading-tight tracking-tighter">
        Reactjs Tiptap Editor
      </h1>
      <div className="flex items-center gap-2">
        <a
          href="https://github.com/hunghg255/reactjs-tiptap-editor"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm font-medium underline-offset-4 hover:underline"
        >
          <GithubIcon size={20} className="text-primary" />
        </a>

        <Popover>
          <PopoverTrigger>
            <SwatchBook size={20} className="text-primary" />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[384px]">
            <div className="mb-[24px] ">
              <Label className="font-semibold text-[18px]">
                Theme Customizer
              </Label>
            </div>

            <div className="mb-1">
              <Label>Color</Label>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <Button
                variant={'outline'}
                onClick={() => {
                  setColor('default');
                  themeActions.setColor('default');
                }}
                className={
                  color === 'default' ? 'bg-accent text-accent-foreground' : ''
                }
              >
                <ColorIcon color="#000000" active={color === 'default'} />
                Default
              </Button>
              <Button
                variant={'outline'}
                onClick={() => {
                  setColor('red');
                  themeActions.setColor('red');
                }}
                className={
                  color === 'red' ? 'bg-accent text-accent-foreground' : ''
                }
              >
                <ColorIcon color="#dc2626" active={color === 'red'} />
                Red
              </Button>
              <Button
                variant={'outline'}
                onClick={() => {
                  setColor('blue');
                  themeActions.setColor('blue');
                }}
                className={
                  color === 'blue' ? 'bg-accent text-accent-foreground' : ''
                }
              >
                <ColorIcon color="#2563eb" active={color === 'blue'} />
                Blue
              </Button>
              <Button
                variant={'outline'}
                onClick={() => {
                  setColor('green');
                  themeActions.setColor('green');
                }}
                className={
                  color === 'green' ? 'bg-accent text-accent-foreground' : ''
                }
              >
                <ColorIcon color="#16a34a" active={color === 'green'} />
                Green
              </Button>
              <Button
                variant={'outline'}
                onClick={() => {
                  setColor('orange');
                  themeActions.setColor('orange');
                }}
                className={
                  color === 'orange' ? 'bg-accent text-accent-foreground' : ''
                }
              >
                <ColorIcon color="#f97316" active={color === 'orange'} />
                Orange
              </Button>
              <Button
                variant={'outline'}
                onClick={() => {
                  setColor('rose');
                  themeActions.setColor('rose');
                }}
                className={
                  color === 'rose' ? 'bg-accent text-accent-foreground' : ''
                }
              >
                <ColorIcon color="#e11d48" active={color === 'rose'} />
                Rose
              </Button>
              <Button
                variant={'outline'}
                onClick={() => {
                  setColor('violet');
                  themeActions.setColor('violet');
                }}
                className={
                  color === 'violet' ? 'bg-accent text-accent-foreground' : ''
                }
              >
                <ColorIcon color="#7c3aed" active={color === 'violet'} />
                Violet
              </Button>
              <Button
                variant={'outline'}
                onClick={() => {
                  setColor('yellow');
                  themeActions.setColor('yellow');
                }}
                className={
                  color === 'yellow' ? 'bg-accent text-accent-foreground' : ''
                }
              >
                <ColorIcon color="#facc15" active={color === 'yellow'} />
                Yellow
              </Button>
            </div>

            <div className="mb-1">
              <Label>Radius</Label>
            </div>
            <div className="flex gap-2 mb-3">
              <Button
                variant={'outline'}
                onClick={() => {
                  setRadius(0);
                  themeActions.setBorderRadius('0rem');
                }}
                className={
                  radius === 0
                    ? 'bg-accent text-accent-foreground flex-1'
                    : 'flex-1'
                }
              >
                0
              </Button>
              <Button
                variant={'outline'}
                onClick={() => {
                  setRadius(0.25);
                  themeActions.setBorderRadius('0.25rem');
                }}
                className={
                  radius === 0.25
                    ? 'bg-accent text-accent-foreground flex-1'
                    : 'flex-1'
                }
              >
                0.25
              </Button>
              <Button
                variant={'outline'}
                onClick={() => {
                  setRadius(0.5);
                  themeActions.setBorderRadius('0.5rem');
                }}
                className={
                  radius === 0.5
                    ? 'bg-accent text-accent-foreground flex-1'
                    : 'flex-1'
                }
              >
                0.5
              </Button>
              <Button
                variant={'outline'}
                onClick={() => {
                  setRadius(0.75);
                  themeActions.setBorderRadius('0.75rem');
                }}
                className={
                  radius === 0.75
                    ? 'bg-accent text-accent-foreground flex-1'
                    : 'flex-1'
                }
              >
                0.75
              </Button>
              <Button
                variant={'outline'}
                onClick={() => {
                  setRadius(1);
                  themeActions.setBorderRadius('1rem');
                }}
                className={
                  radius === 1
                    ? 'bg-accent text-accent-foreground flex-1'
                    : 'flex-1'
                }
              >
                1
              </Button>
            </div>

            <div className="mb-1">
              <Label>Theme</Label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={'outline'}
                onClick={() => {
                  setTheme('light');
                  themeActions.setTheme('light');
                }}
                className={
                  theme === 'light' ? 'bg-accent text-accent-foreground' : ''
                }
              >
                <Sun size={16} />
                Light
              </Button>
              <Button
                variant={'outline'}
                onClick={() => {
                  setTheme('dark');
                  themeActions.setTheme('dark');
                }}
                className={
                  theme === 'dark' ? 'bg-accent text-accent-foreground' : ''
                }
              >
                <Moon size={16} />
                Dark
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
};
