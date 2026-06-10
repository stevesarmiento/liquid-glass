export type NavItem = {
  href: string;
  label: string;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

const menu: NavGroup[] = [
  {
    label: "Get started",
    items: [
      { href: "/", label: "Introduction" },
      { href: "/guides", label: "Guides" },
    ],
  },
  {
    label: "Library",
    items: [
      { href: "/library/controller", label: "Controller" },
      { href: "/library/liquid-blend", label: "Liquid Blend" },
      { href: "/library/lens-params", label: "Lens Params" },
      { href: "/library/react", label: "React" },
    ],
  },
  {
    label: "Components",
    items: [
      { href: "/components/glass-modal", label: "Glass Modal" },
      { href: "/components/glass-slider", label: "Glass Slider" },
      { href: "/components/glass-switch", label: "Glass Switch" },
    ],
  },
];

export default menu;
