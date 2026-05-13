import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Container, Nav, Navbar } from "react-bootstrap";
import useWaitForI18n from "@/shared/hooks/use-wait-for-i18n";
import AdminMenu from "@/shared/components/navbar/admin-menu";
import type { DefaultNavbarMetadata } from "@/shared/components/types/default-navbar-metadata";
import NavItemFromData from "@/shared/components/navbar/nav-item-from-data";
import LoggedInItems from "@/shared/components/navbar/logged-in-items";
import LoggedOutItems from "@/shared/components/navbar/logged-out-items";
import HeaderLogoOrTitle from "@/shared/components/navbar/header-logo-or-title";
import MaterialIcon from "@/shared/components/material-icon";
import { UserProvider } from "@/shared/context/user-context";
import { X } from "@phosphor-icons/react";
import superPaperLogo from "@/shared/images/superpaper-icon.png";
import type { CSSPropertiesWithVariables } from "../../../../../types/css-properties-with-variables";

function DefaultNavbar(
  props: DefaultNavbarMetadata & { brandLogo?: string },
) {
  const {
    brandLogo,
    customLogo,
    title,
    canDisplayAdminMenu,
    canDisplayAdminRedirect,
    canDisplayProjectUrlLookup,
    canDisplayScriptLogMenu,
    suppressNavbarRight,
    suppressNavContentLinks,
    showCloseIcon = false,
    showSignUpLink,
    sessionUser,
    adminUrl,
    items,
  } = props;
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <Navbar
        className="navbar-default navbar-main"
        expand="lg"
        onToggle={(expanded) => setExpanded(expanded)}
        style={
          {
            "--navbar-brand-image-default-url": `url("${superPaperLogo}")`,
            "--navbar-brand-image-redesign-url": `url("${superPaperLogo}")`,
          } as CSSPropertiesWithVariables
        }
        aria-label={t("primary")}
      >
        <Container className="navbar-container" fluid>
          <div className="navbar-header">
            <HeaderLogoOrTitle
              title={title}
              brandLogo={brandLogo}
              customLogo={customLogo}
            />
          </div>
          {suppressNavbarRight ? null : (
            <>
              <Navbar.Toggle
                aria-controls="navbar-main-collapse"
                aria-expanded="false"
                aria-label={t("primary")}
              >
                {showCloseIcon && expanded ? (
                  <X />
                ) : (
                  <MaterialIcon type="menu" />
                )}
              </Navbar.Toggle>
              <Navbar.Collapse
                id="navbar-main-collapse"
                className="justify-content-end"
              >
                <Nav as="ul" className="ms-auto" role="menubar">
                  {canDisplayAdminMenu ||
                  canDisplayAdminRedirect ||
                  canDisplayProjectUrlLookup ? (
                    <AdminMenu
                      canDisplayAdminMenu={canDisplayAdminMenu}
                      canDisplayAdminRedirect={canDisplayAdminRedirect}
                      canDisplayProjectUrlLookup={canDisplayProjectUrlLookup}
                      canDisplayScriptLogMenu={canDisplayScriptLogMenu}
                      adminUrl={adminUrl}
                    />
                  ) : null}
                  {items.map((item, index) => {
                    const showNavItem =
                      (item.only_when_logged_in && sessionUser) ||
                      (item.only_when_logged_out && sessionUser) ||
                      (!item.only_when_logged_out &&
                        !item.only_when_logged_in &&
                        !item.only_content_pages) ||
                      (item.only_content_pages && !suppressNavContentLinks);

                    return showNavItem ? (
                      <NavItemFromData
                        item={item}
                        key={index}
                      />
                    ) : null;
                  })}
                  {sessionUser ? (
                    <LoggedInItems
                      sessionUser={sessionUser}
                    />
                  ) : (
                    <LoggedOutItems showSignUpLink={showSignUpLink} />
                  )}
                </Nav>
              </Navbar.Collapse>
            </>
          )}
        </Container>
      </Navbar>
    </>
  );
}

export const DefaultNavbarRoot = (props: DefaultNavbarMetadata) => {
  const { isReady } = useWaitForI18n();

  if (!isReady) {
    return null;
  }

  return <DefaultNavbar {...props} />;
};

export default DefaultNavbar;
