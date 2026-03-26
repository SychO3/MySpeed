import {Dialog, DialogHeader, DialogBody, DialogFooter} from "@/common/contexts/Dialog";
import {t} from "i18next";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faCheck, faServer, faNetworkWired, faLink, faHashtag} from "@fortawesome/free-solid-svg-icons";
import "./styles.sass";
import React, {useContext, useEffect, useState} from "react";
import OoklaImage from "./assets/img/ookla.webp";
import LibreImage from "./assets/img/libre.webp";
import CloudflareImage from "./assets/img/cloudflare.webp";
import GuizhouImage from "./assets/img/guizhou.webp";
import {jsonRequest, patchRequest} from "@/common/utils/RequestUtil";
import {Trans} from "react-i18next";
import {ConfigContext} from "@/common/contexts/Config";
import {ToastNotificationContext} from "@/common/contexts/ToastNotification";

export const providers = [
    {id: "ookla", name: "Ookla", image: OoklaImage},
    {id: "libre", name: "LibreSpeed", image: LibreImage},
    {id: "cloudflare", name: "Cloudflare", image: CloudflareImage},
    {id: "guizhou", name: "贵州联通", image: GuizhouImage}
];

export const ProviderDialog = ({open, onClose}) => {
    const [config, reloadConfig] = useContext(ConfigContext);
    const updateToast = useContext(ToastNotificationContext);
    const [provider, setProvider] = useState(config.provider || "ookla");
    const [interfaces, setInterfaces] = useState({});
    const [currentInterface, setCurrentInterface] = useState(config.interface || "none");
    const [ooklaServers, setOoklaServers] = useState({});
    const [libreServers, setLibreServers] = useState({});
    const [serverId, setServerId] = useState("none");
    const [libreUrl, setLibreUrl] = useState(config.libreUrl || "none");
    const [guizhouUrl, setGuizhouUrl] = useState(config.guizhouUrl || "http://220.197.44.106:8082");
    const [acceptedOokla, setAcceptedOokla] = useState(config.provider === "ookla");

    useEffect(() => {
        if (!open) return;
        jsonRequest("/info/server/ookla").then(setOoklaServers);
        jsonRequest("/info/server/libre").then(setLibreServers);
        jsonRequest("/info/interfaces").then(setInterfaces);
    }, [open]);

    useEffect(() => {
        if (config[provider + "Id"]) setServerId(config[provider + "Id"]);
        if (config.libreUrl) setLibreUrl(config.libreUrl);
        if (config.guizhouUrl) setGuizhouUrl(config.guizhouUrl);
    }, [provider, config]);

    useEffect(() => {
        if (serverId === "") setServerId("none");
    }, [serverId]);

    useEffect(() => {
        if (libreUrl === "") setLibreUrl("none");
    }, [libreUrl]);

    const handleLibreUrlChange = (value) => {
        setLibreUrl(value);
        if (value && value !== "none") setServerId("none");
    };

    const handleServerIdChange = (value) => {
        setServerId(value);
        if (provider === "libre" && value && value !== "none") setLibreUrl("none");
    };

    const update = async (close) => {
        await patchRequest("/config/provider", {value: provider});
        if (serverId !== config[provider + "Id"] && provider !== "cloudflare" && provider !== "guizhou") {
            await patchRequest("/config/" + provider + "Id", {value: serverId});
        }
        if (provider === "libre" && libreUrl !== config.libreUrl) {
            await patchRequest("/config/libreUrl", {value: libreUrl});
        }
        if (provider === "guizhou" && guizhouUrl !== config.guizhouUrl) {
            await patchRequest("/config/guizhouUrl", {value: guizhouUrl});
        }
        if (currentInterface !== config.interface) {
            await patchRequest("/config/interface", {value: currentInterface});
        }
        reloadConfig();
        updateToast(t('dropdown.provider_changed'), "green", faCheck);
        close();
    };

    const isUsingCustomUrl = provider === "libre" && libreUrl && libreUrl !== "none";
    const canUpdate = provider !== "ookla" || acceptedOokla;

    return (
        <Dialog open={open} onClose={onClose} className="provider-dialog-wrapper">
            {({close}) => (
                <>
                    <DialogHeader onClose={close}>{t("update.provider_title")}</DialogHeader>
                    <DialogBody>
                        <div className="provider-content">
                            <div className="provider-list">
                                {providers.map((current) => (
                                    <div className={`provider-item${current.id === provider ? " provider-item-active" : ""}`}
                                         key={current.id} onClick={() => setProvider(current.id)}>
                                        <img src={current.image} alt={current.name}/>
                                        <h3>{current.name}</h3>
                                    </div>
                                ))}
                            </div>

                            <div className="provider-settings">
                                <div className="provider-setting">
                                    <div className="provider-setting-label">
                                        <FontAwesomeIcon icon={faNetworkWired}/>
                                        <h3>{t("dialog.provider.interface")}</h3>
                                    </div>
                                    <select className="dialog-input provider-input" value={currentInterface}
                                            onChange={(e) => setCurrentInterface(e.target.value)}>
                                        {interfaces && Object.keys(interfaces).map((current, index) => (
                                            <option key={index} value={current}>{current} ({interfaces[current]})</option>
                                        ))}
                                    </select>
                                </div>

                                {provider !== "cloudflare" && provider !== "guizhou" && !isUsingCustomUrl && (
                                    <div className="provider-setting">
                                        <div className="provider-setting-label">
                                            <FontAwesomeIcon icon={faServer}/>
                                            <h3>{t("dialog.provider.server")}</h3>
                                        </div>
                                        <select className="dialog-input provider-input" value={serverId}
                                                onChange={(e) => handleServerIdChange(e.target.value)}>
                                            <option value="none">{t("dialog.provider.choose_automatically")}</option>
                                            {provider === "ookla" && Object.keys(ooklaServers).map((current, index) => (
                                                <option key={index} value={current}>{ooklaServers[current]}</option>
                                            ))}
                                            {provider === "libre" && Object.keys(libreServers).map((current, index) => (
                                                <option key={index} value={current}>{libreServers[current]}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {provider !== "cloudflare" && provider !== "guizhou" && serverId !== "none" && !isUsingCustomUrl && (
                                    <div className="provider-setting">
                                        <div className="provider-setting-label">
                                            <FontAwesomeIcon icon={faHashtag}/>
                                            <h3>{t("dialog.provider.server_id")}</h3>
                                        </div>
                                        <input type="text" className="dialog-input provider-input"
                                               value={serverId === "none" ? "" : serverId}
                                               onChange={(e) => handleServerIdChange(e.target.value)}/>
                                    </div>
                                )}

                                {provider === "libre" && (
                                    <div className="provider-setting">
                                        <div className="provider-setting-label">
                                            <FontAwesomeIcon icon={faLink}/>
                                            <h3>{t("dialog.provider.custom_url")}</h3>
                                        </div>
                                        <input type="text" className="dialog-input provider-input"
                                               placeholder={t("dialog.provider.custom_url_placeholder")}
                                               value={libreUrl === "none" ? "" : libreUrl}
                                               onChange={(e) => handleLibreUrlChange(e.target.value || "none")}/>
                                    </div>
                                )}

                                {provider === "guizhou" && (
                                    <div className="provider-setting">
                                        <div className="provider-setting-label">
                                            <FontAwesomeIcon icon={faLink}/>
                                            <h3>{t("dialog.provider.guizhou_url")}</h3>
                                        </div>
                                        <input type="text" className="dialog-input provider-input"
                                               placeholder="http://220.197.44.106:8082"
                                               value={guizhouUrl === "none" ? "" : guizhouUrl}
                                               onChange={(e) => setGuizhouUrl(e.target.value || "none")}/>
                                    </div>
                                )}
                            </div>

                            {provider === "ookla" && (
                                <label className="provider-license">
                                    <input 
                                        type="checkbox" 
                                        checked={acceptedOokla} 
                                        onChange={(e) => setAcceptedOokla(e.target.checked)}
                                    />
                                    <span>
                                        <Trans components={{
                                            Eula: <a href="https://www.speedtest.net/about/eula" target="_blank" rel="noreferrer"/>,
                                            GDPR: <a href="https://www.speedtest.net/about/privacy" target="_blank" rel="noreferrer"/>,
                                            TOS: <a href="https://www.speedtest.net/about/terms" target="_blank" rel="noreferrer"/>
                                        }}>dialog.provider.ookla_license</Trans>
                                    </span>
                                </label>
                            )}
                        </div>
                    </DialogBody>
                    <DialogFooter>
                        <button className="dialog-btn" onClick={() => update(close)} disabled={!canUpdate}>{t("dialog.update")}</button>
                    </DialogFooter>
                </>
            )}
        </Dialog>
    );
};