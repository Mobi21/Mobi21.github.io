export type * from './upstream/lib/desktop-host';
export const hasDesktopHost=false;
export function projectTroubleshootingInvoke(details:Record<string,unknown>){return details;}
const unavailable=async()=>{throw new Error('This operation requires the Windows app. The portfolio uses fictional local sample data.');};
let preferences={version:1,closeBehavior:'close_window_keep_kora_running',windowsNotificationsEnabled:false,notificationPreview:'hide_details',windowsNotificationsEnabledAt:null,amountsHidden:false};
export const desktopHost={
preferences:async()=>preferences,
setCloseBehavior:async(closeBehavior:string)=>preferences={...preferences,closeBehavior},
setNotificationPreferences:async(enabled:boolean,preview:string)=>preferences={...preferences,windowsNotificationsEnabled:enabled,notificationPreview:preview},
setAmountsHidden:async(amountsHidden:boolean)=>preferences={...preferences,amountsHidden},
setInterfaceScale:async(scale:number)=>scale,
backgroundStart:async()=>({registration:'unavailable',startsPresentationHost:false}),
setBackgroundStart:unavailable,replaceBackgroundStart:unavailable,
lifecycleState:async()=>({phase:'ready',startedAt:'2026-09-13T12:00:00Z',problemCode:null}),
condition:async()=>({observedAt:'2026-09-13T12:00:00Z',lifecycle:{state:'ready',observedAt:'2026-09-13T12:00:00Z'},registration:'unavailable',closeBehavior:'remain_resident',residentState:{state:'unavailable',observedAt:'2026-09-13T12:00:00Z'}}),
closeApplication:unavailable,requestRuntimeStop:unavailable,runtimeStopStatus:unavailable,forceCloseHost:unavailable,
notificationPermission:async()=>'denied',requestNotificationPermission:async()=>'denied',
openLocation:unavailable,openDocument:unavailable,openExternalUrl:unavailable,
inspectLocalBackup:async()=>({status:'cancelled',operationId:'demo'}),createLocalBackup:unavailable,restoreLocalBackup:unavailable,recoveryStatus:unavailable,latestRecoveryStatus:async()=>null,
troubleshootingDetails:async()=>({guiBuild:'portfolio-sample',candidateId:'public-2276bbd',sourceRevision:'2276bbdf996ad081ea2622801121a97ee8a65499',sourceDirty:false,builtAt:'2026-09-13',rendererDigest:'demo',runtimeDigest:'fixture',protocolVersion:'2',hostPhase:'ready',hostInstance:'browser-sample'}),
copyTroubleshootingDetails:unavailable,
browserExtensionStatus:async()=>({registered:false,extensionId:'',hostName:'',extensionPath:null,hostPath:null,reason:'Requires the Windows application'}),setBrowserExtensionEnabled:unavailable,
};
