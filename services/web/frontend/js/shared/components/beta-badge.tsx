import type { FC, MouseEventHandler, ReactNode } from "react";
import OLTooltip from "@/shared/components/ol/ol-tooltip";
import BetaBadgeIcon from "@/shared/components/beta-badge-icon";

type TooltipProps = {
  id: string;
  text: ReactNode;
  className?: string;
  placement?: NonNullable<
    React.ComponentProps<typeof OLTooltip>["overlayProps"]
  >["placement"];
};

type LinkProps = {
  href?: string;
  ref?: React.Ref<HTMLAnchorElement>;
  className?: string;
  onMouseDown?: MouseEventHandler<HTMLAnchorElement>;
};

const BetaBadge: FC<{
  tooltip?: TooltipProps;
  link?: LinkProps;
  description?: ReactNode;
  phase?: string;
}> = ({ tooltip, link = {}, description, phase = "beta" }) => {
  const { href, ...linkProps } = link;
  const resolvedHref = href || (phase === "labs" ? "/labs/participate" : null);

  const badgeContent = (
    <>
      <span className="visually-hidden">{description || tooltip?.text}</span>
      <BetaBadgeIcon phase={phase} />
    </>
  );

  const linkedBadge = resolvedHref ? (
    <a
      target="_blank"
      rel="noopener noreferrer"
      href={resolvedHref}
      {...linkProps}
    >
      {badgeContent}
    </a>
  ) : (
    <span>{badgeContent}</span>
  );

  return tooltip ? (
    <OLTooltip
      id={tooltip.id}
      description={tooltip.text}
      tooltipProps={{ className: tooltip.className }}
      overlayProps={{
        placement: tooltip.placement || "bottom",
        delay: 100,
      }}
    >
      {linkedBadge}
    </OLTooltip>
  ) : (
    linkedBadge
  );
};

export default BetaBadge;
