// Data transport only: the entire rendered application comes from upstream/main.tsx.
import type {SessionMetadata, ShellBootstrap, ConversationTranscript, SessionTransitionInput} from './upstream/lib/runtime';
import {workCalendarRuntime} from './work-calendar-fixture';
import {brainLifeRuntime} from './brain-life-fixture';
import {settingsRuntime} from './settings-fixture';
export type * from './upstream/lib/runtime';
export const isRemoteDevelopment=false;
export class RuntimeRequestError extends Error {code:string; constructor(message:string,options:{code?:string}={}){super(message);this.code=options.code??'demo_unavailable';}}
const stamp='2026-09-13T14:00:00Z';
const unavailable=async()=>{throw new RuntimeRequestError('This is Kora’s real interface with fictional local data. Live AI and external actions require the installed application.');};
let sessions:SessionMetadata[]=[
{id:'sample-lisbon',name:'A week in Lisbon',purpose:'foreground',createdAt:stamp,updatedAt:stamp,leafId:null},
{id:'sample-portfolio',name:'Portfolio launch',purpose:'foreground',createdAt:stamp,updatedAt:stamp,leafId:null},
{id:'sample-dinner',name:'Neighborhood dinner',purpose:'foreground',createdAt:stamp,updatedAt:stamp,leafId:null},
];
let currentSessionId=sessions[0].id;
const examples:Record<string,[string,string]>={
'sample-lisbon':['Help me organize the Lisbon trip. I want time to wander, rather than a packed itinerary.','The plan has three open decisions: **where to stay**, **which day to visit Sintra**, and **what to book ahead**.\n\nSettle accommodation first. Keep the first afternoon free, group nearby places together, and leave a spare day for weather or something you discover along the way.\n\nExplore the project, tasks, calendar, and saved notes through the navigation. This is fictional sample data displayed in Kora’s original conversation interface.'],
'sample-portfolio':['What should I focus on next for my portfolio?','Choose the strongest case study and make its story concrete: the problem, your decisions, and what someone can actually try.\n\nReview the draft with Maya, connect each project to a working example, and check the experience on a small screen.'],
'sample-dinner':['Let’s keep the neighborhood dinner simple.','Start with the date and guest list, then choose one main dish that can be prepared ahead. Ask guests about dietary needs before shopping.\n\nA shared table, a few good dishes, and enough time to talk are the priorities.'],
};
const transcript=(id:string):ConversationTranscript=>{const pair=examples[id];return {sessionId:id,page:{hasMore:false},turns:pair?[{id:`turn-${id}`,acceptedEntryId:`user-${id}`,createdAt:stamp,items:[{id:`user-${id}`,kind:'user_message',status:'completed',createdAt:stamp,content:[{type:'text',text:pair[0]}]},{id:`assistant-${id}`,kind:'assistant_message',status:'completed',createdAt:stamp,content:pair[1]}]}]:[]};};
function session(){return sessions.find(s=>s.id===currentSessionId)??sessions[0];}
const bootstrap=():ShellBootstrap=>({readiness:'ready',epoch:'public-static-workspace',revision:1,viewerTimeZone:'America/New_York',session:session(),run:{state:'idle',cursor:null},model:{provider:'sample',model:'Static sample — live AI unavailable',reasoning:'medium',updatedAt:stamp,configured:true,authenticationRequired:false,access:{state:'ready',reasonCode:'static_fixture',observedAt:stamp}},attention:{pendingApprovals:[],unseenNotifications:1},capabilities:{unavailable:[],degraded:[]}});
const shellRuntime={
isPreview:true,isRemoteDevelopment,prepare:async()=>({runtimeId:'public-static-workspace',startedAt:stamp}),restart:async()=>({runtimeId:'public-static-workspace',startedAt:stamp}),clearConnection:()=>{},bootstrap:async()=>bootstrap(),
sessions:async()=>({sessions:[...sessions]}),searchSessions:async(query:string)=>({results:sessions.filter(s=>s.name?.toLowerCase().includes(query.toLowerCase())).map(s=>({sessionId:s.id,entryId:`user-${s.id}`,role:'user',occurredAt:stamp,excerpt:s.name}))}),
transitionSession:async(input:SessionTransitionInput)=>{const previousSessionId=currentSessionId;if(input.kind==='create'){const next={id:crypto.randomUUID(),name:'New conversation',purpose:'foreground' as const,createdAt:stamp,updatedAt:stamp,leafId:null};sessions.push(next);currentSessionId=next.id;}else if(sessions.some(s=>s.id===input.targetSessionId))currentSessionId=input.targetSessionId!;else throw new RuntimeRequestError('Sample conversation not found.');return {status:'confirmed',previousSessionId,sessionId:currentSessionId,origin:input.origin,replayed:false};},
conversationTranscript:async(id?:string)=>transcript(id??currentSessionId),
renameNamedSession:async(id:string,name:string)=>{const s=sessions.find(x=>x.id===id);if(!s)throw new Error('Conversation not found');s.name=name;return {...s};},renameSession:async(name:string)=>{session().name=name;return {...session()};},
deleteSession:async(id:string)=>{sessions=sessions.filter(s=>s.id!==id);if(!sessions.length)sessions.push({id:'new',name:'New conversation',purpose:'foreground',createdAt:stamp,updatedAt:stamp});if(currentSessionId===id)currentSessionId=sessions[0].id;return {deleted:true,sessionId:id};},
synchronizeSessionTitles:async()=>({results:[]}),sessionNavigation:async()=>({leafId:null,entries:[]}),exportSession:async()=>transcript(currentSessionId),commands:async()=>({commands:[]}),completeCommand:async()=>({suggestions:[]}),toolConfirmations:async()=>({confirmations:[]}),
createConversationRun:unavailable,retryConversationRun:unavailable,conversationRun:unavailable,submit:unavailable,sendNext:unavailable,followUp:unavailable,steer:unavailable,stop:async()=>({stopped:true}),streamConversation:unavailable,ingestConversationAttachment:unavailable,deleteConversationAttachment:unavailable,approveToolConfirmation:unavailable,rejectToolConfirmation:unavailable,forkSession:unavailable,cloneSession:unavailable,importSession:unavailable,navigateSession:unavailable,
issueConversationContextSelection:async()=>({selection:{state:'withheld',authorization:'unavailable',display:{objectKind:'restricted',title:'Restricted item'},reason:'unavailable',retryable:false}}),approveConversationContextSelection:unavailable,inspectConversationCitation:unavailable,artifact:unavailable,openArtifact:unavailable,
};
const implementations={...settingsRuntime,...brainLifeRuntime,...workCalendarRuntime,...shellRuntime};
// Unimplemented runtime operations reject; they never manufacture a successful response.
export const runtime=new Proxy(implementations,{get(target,property){return property in target?target[property as keyof typeof target]:unavailable;}}) as unknown as typeof import('./upstream/lib/runtime').runtime;
