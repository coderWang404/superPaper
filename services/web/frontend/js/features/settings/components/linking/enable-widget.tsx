import { useTranslation } from "react-i18next";
import OLButton from "@/shared/components/ol/ol-button";

type ActionButtonProps = {
  linked?: boolean;
  handleUnlinkClick: () => void;
  handleLinkClick: () => void;
  disabled?: boolean;
  linkText?: string;
  unlinkText?: string;
};

export function ActionButton({
  linked,
  handleUnlinkClick,
  handleLinkClick,
  disabled,
  linkText,
  unlinkText,
}: ActionButtonProps) {
  const { t } = useTranslation();
  const linkingText = linkText || t("turn_on");
  const unlinkingText = unlinkText || t("turn_off");
  if (linked) {
    return (
      <OLButton
        variant="danger-ghost"
        onClick={handleUnlinkClick}
        disabled={disabled}
      >
        {unlinkingText}
      </OLButton>
    );
  } else {
    return (
      <OLButton
        variant="secondary"
        disabled={disabled}
        onClick={handleLinkClick}
      >
        {linkingText}
      </OLButton>
    );
  }
}
