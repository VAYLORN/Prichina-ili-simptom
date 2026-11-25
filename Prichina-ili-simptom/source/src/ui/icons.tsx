// Every icon the game uses, by name. Data files (sectors, board cells, traps, roles) refer to
// icons by these names, so content stays plain JSON.
import {
  Award, BadgeCheck, Ban, Bird, BookOpen, Boxes, Bug, CalendarClock, Calculator, ChartColumn, Check, ChevronLeft, ChevronRight,
  CircleCheck, CirclePause, ClipboardCheck, ClipboardList, Clock, Coffee, Cog, Construction, Crown, Dice5,
  DoorOpen, Download, Drama, Eye, EyeOff, Factory, FileCheck, Flag, Footprints, Forward, Funnel, Gauge, Gavel, GraduationCap,
  Hammer, Handshake, HeartHandshake, Hourglass, Info, LayoutGrid, Lightbulb, ListChecks, Lock, LogOut,
  Maximize, Medal, MessageSquareWarning, MessagesSquare, Mic, MicOff, Microscope, Minus, MonitorPlay, NotebookPen,
  Package, PackageCheck, Pause, Pencil, PhoneCall, Plane, Play, Plus, Presentation, Printer, Puzzle, Repeat,
  RefreshCw, Rocket, RotateCcw, ScanSearch, ScrollText, Search, Settings, ShieldAlert, ShoppingCart, Shuffle,
  Siren, Speech, SquareStack, Stamp, Target, Timer, Trash, TrendingUp, TriangleAlert, Trophy, Truck, Turtle,
  Undo2, Upload, UserCheck, UserPlus, Users, Volume2, VolumeX, Warehouse, WifiOff, Wrench, X, Zap,
  type LucideIcon, type LucideProps,
} from 'lucide-react';

export const ICONS: Record<string, LucideIcon> = {
  Award, BadgeCheck, Ban, Bird, BookOpen, Boxes, Bug, CalendarClock, Calculator, ChartColumn, Check, ChevronLeft, ChevronRight,
  CircleCheck, CirclePause, ClipboardCheck, ClipboardList, Clock, Coffee, Cog, Construction, Crown, Dice5,
  DoorOpen, Download, Drama, Eye, EyeOff, Factory, FileCheck, Flag, Footprints, Forward, Funnel, Gauge, Gavel, GraduationCap,
  Hammer, Handshake, HeartHandshake, Hourglass, Info, LayoutGrid, Lightbulb, ListChecks, Lock, LogOut,
  Maximize, Medal, MessageSquareWarning, MessagesSquare, Mic, MicOff, Microscope, Minus, MonitorPlay, NotebookPen,
  Package, PackageCheck, Pause, Pencil, PhoneCall, Plane, Play, Plus, Presentation, Printer, Puzzle, Repeat,
  RefreshCw, Rocket, RotateCcw, ScanSearch, ScrollText, Search, Settings, ShieldAlert, ShoppingCart, Shuffle,
  Siren, Speech, SquareStack, Stamp, Target, Timer, Trash, TrendingUp, TriangleAlert, Trophy, Truck, Turtle,
  Undo2, Upload, UserCheck, UserPlus, Users, Volume2, VolumeX, Warehouse, WifiOff, Wrench, X, Zap,
};

// Icons offered in the trap editor.
export const TRAP_ICON_CHOICES = [
  'Zap', 'WifiOff', 'MicOff', 'PhoneCall', 'Timer', 'Siren', 'Construction', 'ChartColumn', 'TrendingUp', 'Ban',
  'Repeat', 'Shuffle', 'Drama', 'Puzzle', 'Coffee', 'SquareStack', 'Crown', 'VolumeX', 'Speech', 'Turtle', 'Stamp',
  'Bird', 'CalendarClock', 'Calculator', 'Plane', 'Dice5', 'Hourglass', 'TriangleAlert',
];

export function Icon({ name, ...props }: { name: string } & LucideProps) {
  const Component = ICONS[name] ?? Zap;
  return <Component strokeWidth={1.9} aria-hidden {...props} />;
}
