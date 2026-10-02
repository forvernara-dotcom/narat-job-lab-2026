import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode, RefObject } from 'react';
import { toPng } from 'html-to-image';
import { createClient } from '@supabase/supabase-js';
import type { Session } from '@supabase/supabase-js';
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  UserPlus,
  Trash2,
  Printer,
  ClipboardCheck,
  History,
  FileText,
  LayoutDashboard,
  Share2,
  Copy,
  Check,
  Loader2,
  LogOut,
  RefreshCw,
  Users,
  UserCog,
  Undo2,
  RotateCcw,
  Search,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Briefcase,
  ImageDown,
  ExternalLink,
  X,
} from 'lucide-react';

// ─────────────────────────────────────────────
// 0. Supabase 설정
// ─────────────────────────────────────────────
const SUPABASE_URL = 'https://rvhnvvszispxyrjdihqj.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2aG52dnN6aXNweHlyamRpaHFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3ODEyMDMsImV4cCI6MjEwNjM1NzIwM30.1M4yy-NQ6k2ZuUJRz6pcl1JLdn8NC-1kIubfXvpknJQ';
// 시연 모드: 주소 뒤에 ?demo=1 → 예시 데이터로 동작 (맨 아래 '8. 시연 모드' 참고)
const urlParams = new URLSearchParams(window.location.search);
const IS_DEMO = urlParams.get('demo') === '1';
const DEMO_STORAGE_KEY = 'linkro-demo-db-v1';
const DEMO_USER_ID = 'demo-teacher';
const DEMO_SUFFIX = IS_DEMO ? '&demo=1' : '';

// 검색엔진 제외: 사장님·학생 링크, 학생소개서 공유 링크, 시연 모드 화면은 검색 결과에 나오지 않게 함 (학생 이름 노출 방지)
if (urlParams.get('view') || IS_DEMO) {
  const robots = document.createElement('meta');
  robots.name = 'robots';
  robots.content = 'noindex, nofollow';
  document.head.appendChild(robots);
}
const TRASH_DAYS = 30; // 휴지통 보관 기간
const supabase = IS_DEMO
  ? (createDemoClient(!['ojt', 'self', 'intro'].includes(urlParams.get('view') ?? '')) as unknown as ReturnType<typeof createClient>)
  : createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const STUDENTS_TABLE = 'portfolio_students';
const EVALUATIONS_TABLE = 'portfolio_evaluations';
const PROFILES_TABLE = 'portfolio_profiles';
const EVAL_COLUMNS = 'id, student_id, kind, form, scores, summary, comment, evaluator, input_method, evaluated_at, created_at';
const STUDENT_COLUMNS = 'id, name, grade, main_field, site, created_at, self_token, employer_token, intro, share_token, deleted_at';
const PROFILE_COLUMNS = 'id, email, name, school, role, created_at, contact, consent_version, consented_at, email_confirmed_at';

// ─────────────────────────────────────────────
// 1. 타입
// ─────────────────────────────────────────────
type Kind = 'ojt' | 'teacher' | 'self';
type StaffKind = 'ojt' | 'teacher';
type InputMethod = 'link' | 'phone' | 'paper' | 'interview';
type ProxyMethod = Exclude<InputMethod, 'link'>;
type LinkKind = 'ojt' | 'self';
type Role = 'pending' | 'teacher' | 'admin';
type FormMessage = { type: 'ok' | 'error'; text: string };
type Arrival = { id: string; studentId: string; studentName: string; kind: Kind; evaluator: string | null; rate: number };
type LiveStatus = 'connecting' | 'live' | 'offline';

type Profile = {
  id: string;
  email: string;
  name: string;
  school: string;
  role: Role;
  created_at: string;
  contact: string | null; // 사장님용 자료에 표시할 연락처 (선택)
  consent_version: string | null;
  consented_at: string | null;
  email_confirmed_at: string | null; // 메일 인증 완료 시각 (null = 미인증)
};
type FormKey = 'ojt_senior' | 'ojt_junior' | 'teacher' | 'self_junior' | 'self_senior';
type Track = 'junior' | 'senior';
type ScaleOption = { value: number; label: string; desc: string };
type RubricItem = { id: string; label: string; prompt: string; anchors?: string[] }; // anchors: 척도 순서(높은 점수부터) 행동 예시
type Domain = { key: string; title: string; items: RubricItem[] };
type Option = { value: string; label: string; desc?: string };
type ReflectionPrompt = { key: string; label: string; placeholder: string };

type Rubric = {
  form: FormKey;
  kind: Kind;
  label: string;
  scale: ScaleOption[];
  max: number;
  allowNA: boolean; // '관찰 기회 없음' 선택지 사용 여부
  domains: Domain[];
  summaryTitle: string;
  summaryOptions: Option[];
  commentTitle: string;
  commentPlaceholder: string;
  reflections?: ReflectionPrompt[]; // 자기평가 되돌아보기 질문
};

// 평가 1건 = DB 1행. 학생은 모든 평가 히스토리를 배열로 가짐
type EvaluationRow = {
  id: string;
  student_id: string;
  kind: Kind;
  form: FormKey | null; // 사용한 양식 (예전 기록은 null → 당시 양식으로 해석)
  scores: Record<string, number>; // 0 = 관찰 기회 없음
  summary: string | null;
  comment: string;
  evaluator: string | null; // 평가한 사장님 성함
  input_method: InputMethod | null; // 'link' 직접 제출 / 그 외 교사 대리 입력 방식
  evaluated_at: string;
  created_at: string;
};

type Student = {
  id: string;
  name: string;
  grade: string;
  mainField: string;
  site: string;
  selfToken: string; // 학생 자기평가 링크용
  employerToken: string; // 사장님 평가 링크용
  intro: Intro; // 사장님을 위한 학생소개서
  shareToken: string | null; // 학생소개서 공유 링크 (null = 공유 안 함)
  deletedAt: string | null; // 휴지통으로 옮긴 시각 (null = 사용 중)
  evaluations: EvaluationRow[];
};

type RawEvaluationRow = Omit<EvaluationRow, 'scores' | 'comment' | 'evaluated_at'> & {
  scores: Record<string, number> | null;
  comment: string | null;
  evaluated_at: string | null;
};
type StudentRow = {
  id: string;
  name: string;
  grade: string;
  main_field: string;
  site: string | null;
  created_at: string;
  self_token: string;
  employer_token: string;
  intro: unknown;
  share_token: string | null;
  deleted_at: string | null;
  portfolio_evaluations: RawEvaluationRow[] | null;
};

type Draft = {
  kind: StaffKind;
  date: string;
  scores: Record<string, number>;
  summary: string | null;
  comment: string;
  method: ProxyMethod | null; // 고용주 평가 대리 입력 방식
  evaluator: string; // 고용주 평가 대리 입력 시 사장님 성함
};

const PROXY_METHODS: { value: ProxyMethod; label: string }[] = [
  { value: 'phone', label: '전화 평가' },
  { value: 'paper', label: '종이 평가지' },
  { value: 'interview', label: '현장 면담' },
];

// 평가가 어떤 경로로 들어왔는지 표시 (3자 비교 해석용)
const sourceLabel = (row: { kind: Kind; input_method: InputMethod | null }) => {
  if (row.kind !== 'ojt') return '';
  if (row.input_method === 'link') return '사장님 링크 직접 제출';
  const m = PROXY_METHODS.find((x) => x.value === row.input_method);
  return m ? `교사 대리 입력 · ${m.label}` : '';
};

// ─────────────────────────────────────────────
// 2. 척도 및 루브릭 (연구회 양식 기준)
//   · 중학교 ~ 고2 : 저학년 양식 (과정·중재 중심)
//   · 고3 · 전공과 : 취업 실습 양식 (현장 투입·생산성 중심)
//   · 교사 평가     : 교내 직무훈련 루브릭 (전 학년 공통)
//   anchors(행동 예시)는 척도와 같은 순서(높은 점수 → 낮은 점수)로 적습니다.
// ─────────────────────────────────────────────
const NA = 0; // '관찰 기회 없음' (달성률 계산에서 제외)

// 고2를 취업 실습 양식으로 옮기려면 이 목록에 '고2'를 추가하세요.
const SENIOR_GRADES = ['고3', '전공과'];
const trackOf = (grade: string): Track => (SENIOR_GRADES.includes(grade) ? 'senior' : 'junior');
const TRACK_LABEL: Record<Track, string> = { junior: '저학년 양식 (중학교~고2)', senior: '취업 실습 양식 (고3·전공과)' };

const SCALE_SENIOR: ScaleOption[] = [
  { value: 4, label: '독립적 수행', desc: '관리자의 지시나 촉구 없이 스스로 상황에 맞게 행동함 (취업 유지 가능 수준)' },
  { value: 3, label: '최소 지원', desc: '1~2회의 가벼운 언어적·시각적 촉구가 있으면 수행함' },
  { value: 2, label: '집중 지원', desc: '지속적인 안내와 감독이 있어야만 업무와 태도를 유지함' },
  { value: 1, label: '수행 어려움', desc: '즉각적인 중재가 필요하거나, 타인의 업무를 방해하여 현장 적용이 어려움' },
];

const SCALE_TRAINING: ScaleOption[] = [
  { value: 4, label: '독립적 수행', desc: '교사의 지시나 촉구 없이 스스로 상황에 맞게 행동함' },
  { value: 3, label: '최소 지원', desc: '1~2회의 가벼운 언어적·시각적 촉구가 있으면 수정하고 수행함' },
  { value: 2, label: '집중 지원', desc: '지속적인 안내와 감독, 시범이 있어야만 과제와 태도를 유지함' },
  { value: 1, label: '수행 어려움', desc: '즉각적인 행동 중재가 필요하거나, 타인의 활동을 방해하여 훈련 참여가 어려움' },
];

const SCALE_SELF_JUNIOR: ScaleOption[] = [
  { value: 3, label: '우수', desc: '혼자서 척척! 내가 알아서 잘했어요' },
  { value: 2, label: '보통', desc: '알려줘서 고쳐서 했어요' },
  { value: 1, label: '노력필요', desc: '오늘은 어려웠어요. 내일은 꼭!' },
];

const SCALE_SELF_SENIOR: ScaleOption[] = [
  { value: 3, label: '우수', desc: '프로답게! 지시나 도움 없이 혼자서 해냈어요' },
  { value: 2, label: '보통', desc: '맞춰가는 중! 한 번 알려주어서 바로 고쳤어요' },
  { value: 1, label: '노력필요', desc: '혼자 해결하기 어려워 계속 도움을 받았어요' },
];

// 교사 평가 · 저학년 사업체 평가 공통 항목 (1학년용·중학교 루브릭)
const TRAINING_DOMAINS: Domain[] = [
  {
    key: 'selfcare',
    title: '기본 직무태도 (자기관리)',
    items: [
      {
        id: 't_a1',
        label: '위생 및 복장',
        prompt: '정해진 복장을 스스로 착용하고, 청결한 상태로 훈련장에 입실하는가?',
        anchors: [
          '정해진 복장을 스스로 갖추고 청결한 상태로 시작함',
          '복장·청결을 한 번 짚어 주면 바로 고침',
          '복장을 갖추는 과정을 매번 하나하나 도와주어야 함',
          '복장 착용을 거부하거나 위생 상태 때문에 참여가 어려움',
        ],
      },
      {
        id: 't_a2',
        label: '시간 엄수',
        prompt: '정해진 훈련 시작 시간을 지키고, 허락 없이 훈련 장소를 이탈하지 않는가?',
        anchors: [
          '시작 시간을 스스로 지키고 허락 없이 자리를 뜨지 않음',
          '한 번 알려주면 시간에 맞춰 오고 자리를 지킴',
          '시작·복귀 때마다 데리러 가거나 계속 확인해야 함',
          '자주 늦거나 무단으로 이탈해 활동이 중단됨',
        ],
      },
      {
        id: 't_a3',
        label: '정리 정돈',
        prompt: '훈련이 끝난 후 자신이 사용한 도구와 자리를 스스로 정리하는가?',
        anchors: [
          '끝나면 사용한 도구와 자리를 스스로 정리함',
          '"정리하자" 한 번 말하면 스스로 정리함',
          '무엇을 어디에 둘지 하나씩 알려줘야 정리함',
          '정리를 거부하거나 그대로 두고 자리를 떠남',
        ],
      },
    ],
  },
  {
    key: 'receptive',
    title: '의사소통 및 수용성',
    items: [
      {
        id: 't_c1',
        label: '지시 집중력',
        prompt: '교사가 새로운 과제나 방법을 설명할 때, 시선을 맞추고 경청하는가?',
        anchors: [
          '설명할 때 시선을 맞추고 끝까지 듣고 따라 함',
          '이름을 한 번 부르면 다시 집중해 들음',
          '시범과 반복 설명이 있어야 내용을 따라옴',
          '설명 중 자리를 뜨거나 방해 행동으로 전달이 어려움',
        ],
      },
      {
        id: 't_c2',
        label: '행동 교정 수용',
        prompt: '잘못된 행동이나 작업 방식에 대해 교사가 지적(피드백)했을 때, 고집부리지 않고 행동을 수정하는가?',
        anchors: [
          '지적을 받으면 바로 받아들이고 방식을 고침',
          '머뭇거리지만 한 번 더 설명하면 고쳐서 함',
          '여러 번 시범을 보이고 함께 해야 조금씩 고침',
          '고집을 부리거나 거부해 수정이 이루어지지 않음',
        ],
      },
      {
        id: 't_c3',
        label: '자기 옹호 (도움 요청)',
        prompt: '과제가 너무 어렵거나 진행이 막혔을 때, 포기하거나 엎드리지 않고 교사에게 다가와 도움을 요청하는가?',
        anchors: [
          '막히면 스스로 다가오거나 손을 들어 도움을 요청함',
          '"도와줄까?" 신호를 주면 요청 표현을 함',
          '멈춰 있어 먼저 다가가 상황을 물어봐야 함',
          '포기하거나 엎드리는 등 요청 없이 활동을 중단함',
        ],
      },
    ],
  },
  {
    key: 'persistence',
    title: '과제 지속성',
    items: [
      {
        id: 't_p1',
        label: '착석 및 과제 유지',
        prompt: '본인에게 주어진 과제 분량이 끝날 때까지 딴청을 피우지 않고 자리에 머물며 집중을 유지하는가?',
        anchors: [
          '정해진 분량이 끝날 때까지 자리에서 집중함',
          '가끔 딴청을 피우지만 한 번 말하면 돌아옴',
          '곁에서 계속 이끌어야 분량을 마칠 수 있음',
          '자리 이탈이 잦아 과제를 거의 마치지 못함',
        ],
      },
      {
        id: 't_p2',
        label: '반복 작업 인내력',
        prompt: '단순하고 반복적인 기초 훈련 시, 지루해하거나 거부 반응을 보이지 않고 일정 시간(예: 20분 이상) 지속하는가?',
        anchors: [
          '반복 작업을 20분 이상 스스로 지속함',
          '중간에 한 번 독려하면 끝까지 지속함',
          '짧은 휴식과 잦은 독려가 있어야 이어감',
          '거부 반응이 커서 반복 작업 참여가 어려움',
        ],
      },
    ],
  },
  {
    key: 'safety',
    title: '안전수칙 준수 및 감정 조절',
    items: [
      {
        id: 't_s1',
        label: '작업장 안전수칙 준수',
        prompt: '도구(가위, 칼, 조리기구 등) 사용 및 훈련장 내 이동 시, 교사가 안내한 안전수칙을 엄격하게 준수하는가?',
        anchors: [
          '도구 사용·이동 시 안전수칙을 스스로 지킴',
          '한 번 짚어 주면 바로 안전하게 고쳐서 함',
          '도구를 쓸 때마다 곁에서 지켜보며 안내해야 함',
          '안전수칙을 반복해서 어겨 도구 사용을 맡기기 어려움',
        ],
      },
      {
        id: 't_s2',
        label: '기본 안전 인지',
        prompt: '위험한 상황(뜨거운 물, 날카로운 물건, 기계 작동 등)을 스스로 인지하고, 함부로 만지거나 장난치지 않는가?',
        anchors: [
          '위험한 물건·상황을 알아채고 스스로 피함',
          '"위험해" 한 번 알려주면 바로 멈춤',
          '위험한 물건 근처에서는 계속 곁에서 지켜봐야 함',
          '위험한 것을 만지거나 장난쳐서 즉시 제지가 필요함',
        ],
      },
      {
        id: 't_s3',
        label: '실패 시 감정 조절',
        prompt: '뜻대로 과제가 수행되지 않거나 실수를 했을 때, 소리 지르기나 자해 등 부적절한 행동 없이 감정을 통제하는가?',
        anchors: [
          '실수해도 차분하게 다시 시도함',
          '속상해하지만 짧게 달래 주면 다시 참여함',
          '진정 시간과 지속적인 도움이 있어야 다시 참여함',
          '소리 지르기·자해 등 즉각적인 중재가 필요한 행동이 나타남',
        ],
      },
    ],
  },
];

// 저학년 사업체 평가: 교사 평가와 같은 항목을 현장 담당자 표현으로 바꿔 사용 (3자 비교가 1:1로 맞음)
const toSiteWording = (text: string) =>
  text
    .replace(/교사가/g, '담당자가')
    .replace(/교사에게/g, '담당자에게')
    .replace(/교사의/g, '담당자의')
    .replace(/훈련장/g, '실습장')
    .replace(/훈련/g, '실습');

const JUNIOR_SITE_DOMAINS: Domain[] = TRAINING_DOMAINS.map((d) => ({
  ...d,
  items: d.items.map((i) => ({
    ...i,
    id: i.id.replace(/^t_/, 'jo_'),
    prompt: toSiteWording(i.prompt),
    anchors: i.anchors?.map(toSiteWording),
  })),
}));

const SCALE_JUNIOR_SITE: ScaleOption[] = SCALE_TRAINING.map((s) => ({ ...s, desc: toSiteWording(s.desc) }));

// 고3·전공과 사업체 평가 (3학년용 루브릭)
const SENIOR_SITE_DOMAINS: Domain[] = [
  {
    key: 'attitude',
    title: '기본 직업 태도 (자기관리)',
    items: [
      {
        id: 'a1',
        label: '위생 및 복장',
        prompt: '출근 시 씻고 왔는지, 머리와 옷차림은 깨끗한지 등 직장인으로서 기본 위생 상태가 좋습니까?',
        anchors: [
          '매일 스스로 단정한 상태로 출근하고, 더러워지면 알아서 정리함',
          '가끔 머리·옷매무새를 짚어 주면 바로 고침',
          '위생·복장 상태를 매번 확인하고 챙겨 주어야 함',
          '지적해도 개선되지 않아 고객·위생 기준에 맞지 않음',
        ],
      },
      {
        id: 'a2',
        label: '시간 엄수 및 근태',
        prompt: '지각하지 않고 출퇴근 시간을 잘 지키며, 허락 없이 마음대로 자리를 비우지 않습니까?',
        anchors: [
          '지각·무단 이탈 없이 출퇴근 시간을 스스로 지킴',
          '가끔 늦거나 자리를 비우지만 한 번 말하면 고침',
          '출근 확인 연락이나 자리 확인을 계속 해야 함',
          '잦은 지각·무단 이탈로 근무 일정 운영이 어려움',
        ],
      },
      {
        id: 'a3',
        label: '휴게 시간 준수',
        prompt: '일할 때와 쉴 때를 잘 구분하며, 쉬는 시간이 끝나면 알아서 자기 자리로 돌아와 일할 준비를 합니까?',
        anchors: [
          '쉬는 시간이 끝나면 스스로 자리로 돌아와 일을 시작함',
          '"시간 됐어요" 한 번 알려주면 바로 복귀함',
          '매번 불러야 복귀하고, 쉬는 시간이 자주 길어짐',
          '휴식과 업무 구분이 어려워 업무 흐름이 끊김',
        ],
      },
    ],
  },
  {
    key: 'communication',
    title: '의사소통 및 대인관계',
    items: [
      {
        id: 'c1',
        label: '지시 수용',
        prompt: '지시받은 업무를 불만 없이 수용하며, 지시된 내용과 기한에 맞게 수행합니까?',
        anchors: [
          '지시를 불평 없이 받아들이고 내용·기한에 맞게 끝냄',
          '지시 내용을 한 번 더 확인해 주면 맞게 수행함',
          '지시를 여러 번 반복하고 옆에서 지켜봐야 수행함',
          '지시를 거부하거나 무시해 업무 배정이 어려움',
        ],
      },
      {
        id: 'c2',
        label: '도움 요청 (자기옹호)',
        prompt: '일하다 모르는 것이 생기거나 실수를 했을 때, 제멋대로 넘겨짚지 않고 질문이나 도움을 요청합니까?',
        anchors: [
          '모르거나 실수하면 스스로 먼저 질문하거나 알림',
          '"모르면 물어봐요"라고 상기시켜 주면 질문함',
          '멈춰 있거나 짐작으로 진행해 먼저 다가가 확인해야 함',
          '문제가 생겨도 알리지 않아 실수가 반복되거나 커짐',
        ],
      },
      {
        id: 'c4',
        label: '피드백 수용 (실수 인정·수정)',
        prompt: '실수가 발생했을 때, 솔직히 인정하고 지적받은 내용을 수정하여 수행합니까?',
        anchors: [
          '실수를 솔직히 인정하고, 지적받은 내용을 다음부터 스스로 고침',
          '지적하면 수긍하고, 한두 번 더 짚어 주면 고쳐서 함',
          '같은 지적을 여러 번 해야 조금씩 고쳐짐',
          '실수를 부인하거나 지적에 강하게 반발함',
        ],
      },
      {
        id: 'c3',
        label: '직장 예절',
        prompt: '사장님이나 같이 일하는 동료들에게 출퇴근 인사, 감사, 사과 등의 예의 바른 표현을 잘 씁니까?',
        anchors: [
          '출퇴근 인사, 감사·사과 표현을 스스로 상황에 맞게 함',
          '인사를 가끔 놓치지만 한 번 알려주면 바로 함',
          '인사·예의 표현을 매번 알려줘야 함',
          '무례한 말이나 행동으로 동료·고객이 불편해함',
        ],
      },
    ],
  },
  {
    key: 'engagement',
    title: '직무 참여 및 감정 조절',
    items: [
      {
        id: 'e1',
        label: '과제 지속성',
        prompt: '맡은 일이 끝날 때까지 딴짓하거나 돌아다니지 않고 자기 자리에 앉아 집중해서 일합니까?',
        anchors: [
          '맡은 일이 끝날 때까지 자리에서 집중해 마무리함',
          '가끔 딴짓을 하지만 한 번 말하면 다시 집중함',
          '자주 멈추거나 돌아다녀 계속 곁에서 이끌어야 함',
          '작업을 중간에 그만두거나 자리를 떠서 맡기기 어려움',
        ],
      },
      {
        id: 'e2',
        label: '감정 조절 / 스트레스 대처',
        prompt: '피곤하거나 지적을 받았을 때, 짜증을 내거나 물건을 던지는 등의 돌발 행동 없이 차분하게 감정을 조절합니까?',
        anchors: [
          '피곤하거나 지적받아도 차분하게 감정을 조절함',
          '표정이 굳거나 짜증이 보이지만 잠시 쉬면 회복함',
          '짜증·불평이 자주 드러나 진정시키는 도움이 필요함',
          '소리 지르기·물건 던지기 등 돌발 행동이 나타남',
        ],
      },
      {
        id: 'e4',
        label: '안전장비·작업복 착용',
        prompt: '사업체에 정해진 안전장비와 작업복을 철저히 착용합니까?',
        anchors: [
          '정해진 안전장비·작업복을 스스로 빠짐없이 착용함',
          '가끔 빠뜨리지만 한 번 알려주면 바로 착용함',
          '착용 여부를 매번 확인하고 챙겨 주어야 함',
          '알려줘도 착용을 거부하거나 자주 벗어 위험함',
        ],
      },
      {
        id: 'e3',
        label: '안전 수칙 준수 (작업 절차)',
        prompt: '사업체의 작업 절차와 안전 규정을 준수합니까?',
        anchors: [
          '작업 절차와 안전 규정을 스스로 지킴',
          '가끔 절차를 건너뛰지만 한 번 짚어 주면 지킴',
          '위험 작업마다 곁에서 지켜보며 안내해야 함',
          '안전 규정을 반복해서 어겨 사고 위험이 있음',
        ],
      },
    ],
  },
  {
    key: 'performance',
    title: '실제 직무 성과 및 유연성 (생산성)',
    items: [
      {
        id: 'p1',
        label: '작업 정확성',
        prompt: '처음 알려준 방법대로 불량이나 실수 없이 작업을 깔끔하게 마무리합니까?',
        anchors: [
          '배운 방법대로 불량·실수 없이 깔끔하게 마무리함',
          '가끔 실수가 있지만 한 번 알려주면 바로 고침',
          '결과물을 자주 확인하고 다시 하게 해야 함',
          '불량이 잦아 결과물을 그대로 쓰기 어려움',
        ],
      },
      {
        id: 'p2',
        label: '작업 속도',
        prompt: '주어진 시간 안에 딴청 피우지 않고 요구하는 작업량(개수·진도)을 채웁니까?',
        anchors: [
          '주어진 시간 안에 요구하는 작업량을 스스로 채움',
          '속도를 한 번 독려하면 작업량을 채움',
          '계속 독려해도 작업량의 절반 정도 수준임',
          '작업량을 거의 채우지 못해 업무 대체가 필요함',
        ],
      },
      {
        id: 'p4',
        label: '작업 숙달 (일정한 페이스)',
        prompt: '시간이 지나도 일정한 작업 페이스를 유지합니까?',
        anchors: [
          '시간이 지나도 일정한 속도와 품질을 유지함',
          '후반에 느려지지만 한 번 독려하면 페이스를 되찾음',
          '기복이 커서 중간중간 점검하고 조정해야 함',
          '금방 지치거나 흐트러져 페이스 유지가 어려움',
        ],
      },
      {
        id: 'p3',
        label: '돌발 상황 대처 (순서·담당자 변경)',
        prompt: '갑자기 작업 순서가 바뀌거나 담당자가 교체되어도 당황하지 않고 새로운 지시를 잘 따릅니까?',
        anchors: [
          '순서나 담당자가 바뀌어도 당황하지 않고 새 지시를 따름',
          '잠시 멈칫하지만 한 번 설명해 주면 바로 적응함',
          '변화가 생기면 자세한 설명과 적응 시간이 필요함',
          '변화가 생기면 작업을 멈추거나 거부해 진행이 어려움',
        ],
      },
      {
        id: 'p5',
        label: '돌발 상황 대처 (비상 상황 보고)',
        prompt: '기기 고장, 물품 부족 등 비상 상황이 발생하면 즉시 관리자에게 알리고 지시를 따릅니까?',
        anchors: [
          '문제가 생기면 즉시 관리자에게 알리고 지시를 따름',
          '늦게 알리지만 물어보면 바로 설명하고 따름',
          '문제가 생겨도 멈춰 있어 관리자가 먼저 발견해야 함',
          '문제를 숨기거나 임의로 처리해 상황이 커짐',
        ],
      },
    ],
  },
];

// 자기평가 (연구회 서식1: 저학년·중학생 / 고3)
const SELF_JUNIOR_DOMAINS: Domain[] = [
  {
    key: 'basic',
    title: '기본 직무 태도',
    items: [
      { id: 's_b2', label: '시간 지키기', prompt: '늦지 않게 제시간에 도착했나요?' },
      { id: 's_b1', label: '단정한 옷차림', prompt: '머리와 옷차림을 단정하게 하고 훈련을 시작했나요?' },
    ],
  },
  {
    key: 'advocacy',
    title: '의사소통 및 자기 옹호',
    items: [
      { id: 's_a2', label: '도움 요청', prompt: '모르는 것이 있을 때, 내 마음대로 하지 않고 선생님께 다가가 질문했나요?' },
      { id: 's_a3', label: '끝까지 듣기', prompt: '다른 사람의 말을 끝까지 잘 들었나요?' },
      { id: 's_a1', label: '바르게 인사하기', prompt: '선생님이나 친구의 눈을 보고 바르게 인사했나요?' },
    ],
  },
  {
    key: 'persistence',
    title: '과제 지속 및 안전수칙',
    items: [
      { id: 's_p1', label: '포기하지 않기', prompt: '하기 싫은 일도 중간에 포기하지 않았나요?' },
      { id: 's_e1', label: '안전수칙', prompt: '위험한 도구를 함부로 만지지 않고, 안전수칙을 잘 지켰나요?' },
    ],
  },
  {
    key: 'emotion',
    title: '감정 조절',
    items: [
      { id: 's_e2', label: '화날 때 참기', prompt: '화가 나거나 당황했을 때, 소리 지르지 않고 참았나요?' },
      { id: 's_e3', label: '지적받을 때 참기', prompt: '일이 마음대로 안 되거나 지적을 받았을 때, 짜증 내지 않고 꾹 참았나요?' },
    ],
  },
];

const SELF_SENIOR_DOMAINS: Domain[] = [
  {
    key: 'basic',
    title: '기본 직무 태도',
    items: [
      { id: 'ss_b1', label: '시간·휴게 지키기', prompt: '지각하지 않고, 쉬는 시간이 끝나면 알아서 내 자리로 돌아왔나요?' },
      { id: 'ss_b2', label: '복장과 위생', prompt: '일터(식당, 공장 등)에 맞는 깨끗한 복장과 위생 상태를 지켰나요?' },
    ],
  },
  {
    key: 'relation',
    title: '의사소통 및 동료 관계',
    items: [
      { id: 'ss_a1', label: '도움 요청', prompt: '일하다 모르는 것이 생겼을 때, 내 맘대로 하지 않고 사장님께 다가가 질문했나요?' },
      { id: 'ss_a2', label: '동료 배려', prompt: '같이 일하는 동료들의 자리나 물건을 함부로 건드리지 않고 배려했나요?' },
      { id: 'ss_a3', label: '바르게 인사하기', prompt: '사장님이나 동료의 눈을 보고 바르게 인사했나요?' },
    ],
  },
  {
    key: 'performance',
    title: '실제 직무 성과',
    items: [
      { id: 'ss_p1', label: '포기하지 않기', prompt: '하기 싫은 일도 중간에 포기하지 않았나요?' },
      { id: 'ss_p2', label: '정확하게 완성', prompt: '처음 배운 방법대로 불량이나 실수 없이 작업을 깔끔하게 완성했나요?' },
      { id: 'ss_p3', label: '작업량 채우기', prompt: '딴청 피우지 않고, 사장님이 오늘 나에게 시킨 작업량(개수)을 다 채웠나요?' },
    ],
  },
  {
    key: 'flexibility',
    title: '유연성 및 안전 (돌발 상황)',
    items: [
      { id: 'ss_e1', label: '안전수칙', prompt: '위험한 도구를 함부로 만지지 않고, 안전수칙을 잘 지켰나요?' },
      { id: 'ss_e2', label: '지적받을 때 참기', prompt: '일이 마음대로 안 되거나 지적을 받았을 때, 짜증 내지 않고 참았나요?' },
      { id: 'ss_e3', label: '변화에 맞추기', prompt: '갑자기 순서가 바뀌거나 담당자가 바뀌어도, 짜증 내지 않고 새로운 지시를 따랐나요?' },
    ],
  },
];

const EMPLOYER_SUMMARY_SENIOR: Option[] = [
  { value: 'hire', label: '즉시 채용 수준', desc: 'TO가 있다면 당장 우리 회사 직원으로 채용하고 싶습니다.' },
  { value: 'positive', label: '긍정적 검토 수준', desc: '조금만 더 연습하면 충분히 현장 취업이 가능해 보입니다.' },
  { value: 'training', label: '추가 훈련 필요', desc: '아직은 현장 실습보다 학교에서의 기초 훈련이 더 필요해 보입니다.' },
];

const TRAINING_SUMMARY: Option[] = [
  { value: 'advanced', label: '심화 훈련 가능', desc: '현재의 지시 수용성과 집중력으로 복잡한 직무 훈련(바리스타, 조립 등) 투입 가능' },
  { value: 'basic', label: '기초 훈련 지속', desc: '아직은 개별적인 행동 중재와 단순 과제 반복 훈련이 더 필요함' },
  { value: 'intensive', label: '집중 행동 중재 요망', desc: '직무 훈련 이전에 착석 유지, 감정 조절 등 선행 행동 중재가 시급함' },
];

const EMPLOYER_SUMMARY_JUNIOR: Option[] = [
  { value: 'advanced', label: '심화 실습 가능', desc: '지금처럼 하면 더 복잡한 업무도 맡겨 볼 수 있겠습니다.' },
  { value: 'basic', label: '기초 실습 지속', desc: '지금 수준의 단순한 업무를 더 반복해 익히면 좋겠습니다.' },
  { value: 'intensive', label: '집중 지원 필요', desc: '실습 전에 학교에서 태도·행동 지도가 먼저 필요해 보입니다.' },
];

const FORMS: Record<FormKey, Rubric> = {
  ojt_senior: {
    form: 'ojt_senior',
    kind: 'ojt',
    label: '고용주 평가 · 취업 실습 양식',
    scale: SCALE_SENIOR,
    max: 4,
    allowNA: true,
    domains: SENIOR_SITE_DOMAINS,
    summaryTitle: '고용주 최종 만족도',
    summaryOptions: EMPLOYER_SUMMARY_SENIOR,
    commentTitle: '고용주 종합 의견 (강점 및 실전 사용 설명서)',
    commentPlaceholder: '예: 반복 작업은 잘하나, 속도가 조금 아쉽습니다. / 인사를 아주 잘합니다.',
  },
  ojt_junior: {
    form: 'ojt_junior',
    kind: 'ojt',
    label: '고용주 평가 · 저학년 양식',
    scale: SCALE_JUNIOR_SITE,
    max: 4,
    allowNA: true,
    domains: JUNIOR_SITE_DOMAINS,
    summaryTitle: '현장 담당자 종합 판단',
    summaryOptions: EMPLOYER_SUMMARY_JUNIOR,
    commentTitle: '담당자 종합 의견',
    commentPlaceholder: '예: 정리 정돈을 스스로 잘합니다. / 설명할 때 한 번씩 이름을 불러 주면 집중합니다.',
  },
  teacher: {
    form: 'teacher',
    kind: 'teacher',
    label: '교사 평가 · 교내 직무훈련',
    scale: SCALE_TRAINING,
    max: 4,
    allowNA: true,
    domains: TRAINING_DOMAINS,
    summaryTitle: '현재 전환 핵심 기술 도달 수준',
    summaryOptions: TRAINING_SUMMARY,
    commentTitle: '지도 목표 설정 (중재 계획)',
    commentPlaceholder: '예: 과제 지속성은 좋으나, 지적을 받았을 때의 감정 조절 훈련이 최우선으로 필요함',
  },
  self_junior: {
    form: 'self_junior',
    kind: 'self',
    label: '자기평가 · 저학년 양식',
    scale: SCALE_SELF_JUNIOR,
    max: 3,
    allowNA: false,
    domains: SELF_JUNIOR_DOMAINS,
    summaryTitle: '',
    summaryOptions: [],
    commentTitle: '오늘 나의 훈련 되돌아보기',
    commentPlaceholder: '',
    reflections: [
      { key: 'best', label: '오늘 내가 가장 잘한 점은?', placeholder: '예: 끝까지 자리에 앉아서 포장 작업을 20개 완성했습니다.' },
      { key: 'goal', label: '내일 나의 다짐 (목표)!', placeholder: '예: 모르는 것이 생기면 손을 들고 먼저 질문하겠습니다.' },
    ],
  },
  self_senior: {
    form: 'self_senior',
    kind: 'self',
    label: '자기평가 · 취업 실습 양식',
    scale: SCALE_SELF_SENIOR,
    max: 3,
    allowNA: false,
    domains: SELF_SENIOR_DOMAINS,
    summaryTitle: '',
    summaryOptions: [],
    commentTitle: '오늘 나의 실습 되돌아보기',
    commentPlaceholder: '',
    reflections: [
      { key: 'best', label: '오늘 내가 가장 잘한 점은?', placeholder: '예: 끝까지 자리에 앉아서 포장 작업을 20개 완성했습니다.' },
      { key: 'praise', label: '오늘 사장님(관리자)에게 칭찬받은 점은?', placeholder: '예: 박스 접기 50개를 시간 안에 다 채웠다고 칭찬받았습니다.' },
      { key: 'goal', label: '내일 나의 다짐 (목표)!', placeholder: '예: 갑자기 다른 일을 시키셔도 당황하지 않고 "네!" 하고 대답하겠습니다.' },
    ],
  },
};

const formFor = (kind: Kind, grade: string): FormKey => {
  const t = trackOf(grade);
  if (kind === 'teacher') return 'teacher';
  if (kind === 'ojt') return t === 'senior' ? 'ojt_senior' : 'ojt_junior';
  return t === 'senior' ? 'self_senior' : 'self_junior';
};
// 양식 기록이 없는 예전 평가는 당시 사용하던 양식으로 해석
const formOf = (row: { kind: Kind; form: FormKey | null }): FormKey =>
  row.form ?? (row.kind === 'ojt' ? 'ojt_senior' : row.kind === 'teacher' ? 'teacher' : 'self_junior');
const rubricOf = (row: { kind: Kind; form: FormKey | null }) => FORMS[formOf(row)];

const KINDS: Kind[] = ['ojt', 'teacher', 'self'];
const KIND_SHORT: Record<Kind, string> = { ojt: '고용주', teacher: '교사', self: '학생' };
const KIND_LABEL: Record<Kind, string> = { ojt: '고용주 (OJT)', teacher: '교사 (교내)', self: '학생 (자기평가)' };

// 3자 통합 차트용 공통 축: 양식마다 의미가 같은 항목끼리 묶어 달성률(%)로 비교
type Axis = { key: string; label: string; items: Partial<Record<FormKey, string[]>> };
const INTEGRATED_AXES: Axis[] = [
  {
    key: 'selfcare',
    label: '자기관리',
    items: {
      ojt_senior: ['a1', 'a2', 'a3'],
      ojt_junior: ['jo_a1', 'jo_a2', 'jo_a3'],
      teacher: ['t_a1', 't_a2', 't_a3'],
      self_junior: ['s_b1', 's_b2'],
      self_senior: ['ss_b1', 'ss_b2'],
    },
  },
  {
    key: 'advocacy',
    label: '의사소통·자기옹호',
    items: {
      ojt_senior: ['c1', 'c2', 'c4', 'c3'],
      ojt_junior: ['jo_c1', 'jo_c2', 'jo_c3'],
      teacher: ['t_c1', 't_c2', 't_c3'],
      self_junior: ['s_a1', 's_a2', 's_a3'],
      self_senior: ['ss_a1', 'ss_a2', 'ss_a3'],
    },
  },
  {
    key: 'persistence',
    label: '과제 지속성',
    items: {
      ojt_senior: ['e1'],
      ojt_junior: ['jo_p1', 'jo_p2'],
      teacher: ['t_p1', 't_p2'],
      self_junior: ['s_p1'],
      self_senior: ['ss_p1'],
    },
  },
  {
    key: 'safety',
    label: '안전·감정 조절',
    items: {
      ojt_senior: ['e2', 'e4', 'e3'],
      ojt_junior: ['jo_s1', 'jo_s2', 'jo_s3'],
      teacher: ['t_s1', 't_s2', 't_s3'],
      self_junior: ['s_e1', 's_e2', 's_e3'],
      self_senior: ['ss_e1', 'ss_e2'],
    },
  },
];
// 취업 실습 양식에만 있는 영역 (교사 평가에는 없어서 차트에서는 빼고 비교표에만 표시)
const PERFORMANCE_AXIS: Axis = {
  key: 'performance',
  label: '직무 성과·유연성',
  items: { ojt_senior: ['p1', 'p2', 'p4', 'p3', 'p5'], self_senior: ['ss_p2', 'ss_p3', 'ss_e3'] },
};

const SERIES_STYLE: Record<Kind, { stroke: string; strokeWidth: number; dash?: string; fill: string; fillOpacity: number }> = {
  ojt: { stroke: '#171717', strokeWidth: 3, fill: '#171717', fillOpacity: 0 },
  teacher: { stroke: '#737373', strokeWidth: 2.5, dash: '6 4', fill: '#737373', fillOpacity: 0 },
  self: { stroke: '#a3a3a3', strokeWidth: 1.5, fill: '#a3a3a3', fillOpacity: 0.35 },
};

const GRADES = ['중1', '중2', '중3', '고1', '고2', '고3', '전공과'];
const TEACHER_TARGET_GRADES = ['중1', '중2', '중3', '고1', '고2'];
const FIELD_SUGGESTIONS = ['제과제빵 보조', '레스토랑 외식서비스', '화장지 공장', '바리스타 보조', '사무 보조', '물류 포장'];

// ─────────────────────────────────────────────
// 3. 계산 로직
// ─────────────────────────────────────────────
const allItems = (rubric: Rubric) => rubric.domains.flatMap((d) => d.items);
const isScored = (v: number | undefined): v is number => typeof v === 'number' && v >= 1;
// 달성률 = 응답 점수 합 ÷ (응답 항목 수 × 만점). '관찰 기회 없음'과 미응답 항목은 빼고 계산
const rateOf = (scores: Record<string, number>, ids: string[], max: number) => {
  const valid = ids.filter((id) => isScored(scores[id]));
  if (valid.length === 0) return 0;
  const sum = valid.reduce((acc, id) => acc + scores[id], 0);
  return Math.round((sum / (valid.length * max)) * 100);
};
const rateOrNull = (scores: Record<string, number>, ids: string[], max: number) =>
  ids.some((id) => isScored(scores[id])) ? rateOf(scores, ids, max) : null;
const pct = (n: number | null) => (n === null ? '-' : `${n}%`);
const overallRate = (row: EvaluationRow) => {
  const rubric = rubricOf(row);
  return rateOf(row.scores, allItems(rubric).map((i) => i.id), rubric.max);
};
const domainRate = (row: EvaluationRow, domain: Domain) =>
  rateOrNull(row.scores, domain.items.map((i) => i.id), rubricOf(row).max);
const axisRate = (row: EvaluationRow, axis: Axis) => rateOrNull(row.scores, axis.items[formOf(row)] ?? [], rubricOf(row).max);
const optionLabel = (row: EvaluationRow) => rubricOf(row).summaryOptions.find((o) => o.value === row.summary)?.label ?? '-';
const naCount = (row: EvaluationRow) => allItems(rubricOf(row)).filter((i) => row.scores[i.id] === NA).length;

const byTimeAsc = (a: EvaluationRow, b: EvaluationRow) =>
  a.evaluated_at.localeCompare(b.evaluated_at) || a.created_at.localeCompare(b.created_at);
const latestOf = (evals: EvaluationRow[], kind: Kind): EvaluationRow | null => {
  const list = evals.filter((e) => e.kind === kind).sort(byTimeAsc);
  return list.length ? list[list.length - 1] : null;
};

const today = () => {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};
const emptyDraft = (kind: StaffKind): Draft => ({
  kind,
  date: today(),
  scores: {},
  summary: null,
  comment: '',
  method: null,
  evaluator: '',
});
const linkFor = (kind: LinkKind, token: string) =>
  `${window.location.origin}${window.location.pathname}?view=${kind}&t=${encodeURIComponent(token)}${DEMO_SUFFIX}`;

const normalizeEval = (raw: RawEvaluationRow): EvaluationRow => ({
  ...raw,
  scores: raw.scores ?? {},
  comment: raw.comment ?? '',
  evaluated_at: raw.evaluated_at ?? raw.created_at.slice(0, 10),
});

const toStudent = (row: StudentRow): Student => ({
  id: row.id,
  name: row.name,
  grade: row.grade,
  mainField: row.main_field,
  site: row.site ?? '',
  selfToken: row.self_token,
  intro: parseIntro(row.intro),
  shareToken: row.share_token ?? null,
  deletedAt: row.deleted_at ?? null,
  employerToken: row.employer_token,
  evaluations: (row.portfolio_evaluations ?? []).map(normalizeEval).sort(byTimeAsc),
});

const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 12mm; }
  html, body { background: #fff !important; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

const inputClass =
  'w-full border-2 border-neutral-300 px-3 py-2 text-base md:text-sm focus:outline-none focus:border-neutral-900 bg-white';

// ─────────────────────────────────────────────
// 4. 라우팅
//   ?view=ojt&t=토큰   → 사장님 OJT 평가 (로그인 없음, 구글폼처럼 링크만)
//   ?view=self&t=토큰  → 학생 자기평가 (로그인 없음)
//   그 외              → 교사 로그인 → 관리자 승인을 받은 교사만 대시보드
// ─────────────────────────────────────────────
export default function App() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view');
  const token = params.get('t');
  const linkKind: LinkKind | null = token && (view === 'ojt' || view === 'self') ? view : null;
  if (view === 'intro' && token) {
    return (
      <>
        <style>{PRINT_CSS}</style>
        {IS_DEMO && <DemoBanner />}
        <SharedProfilePage token={token} />
      </>
    );
  }
  return (
    <>
      <style>{PRINT_CSS}</style>
      {IS_DEMO && <DemoBanner />}
      {linkKind && token ? <LinkEvaluationPage kind={linkKind} token={token} /> : <AuthGate />}
    </>
  );
}

// ─────────────────────────────────────────────
// 5-0. 항목 하나 채점 (점수 버튼 + 관찰 기회 없음 + 점수별 행동 예시)
// ─────────────────────────────────────────────
function ItemScorer({
  item,
  scale,
  allowNA,
  value,
  onChange,
  large = false,
}: {
  item: RubricItem;
  scale: ScaleOption[];
  allowNA: boolean;
  value: number | undefined;
  onChange: (v: number) => void;
  large?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selectedIndex = scale.findIndex((sc) => sc.value === value);
  const anchor = item.anchors && selectedIndex >= 0 ? item.anchors[selectedIndex] : null;

  return (
    <div className={large ? 'py-6' : 'py-5'}>
      {large ? (
        <p className="text-lg font-semibold leading-relaxed">{item.prompt}</p>
      ) : (
        <>
          <p className="text-sm font-bold">{item.label}</p>
          <p className="text-sm text-neutral-600 mt-1 leading-relaxed">{item.prompt}</p>
        </>
      )}
      <div className="max-w-xl">
        <div className={`grid mt-3 ${scale.length === 3 ? 'grid-cols-3 gap-3' : 'grid-cols-4 gap-2'}`}>
          {scale.map((sc) => {
            const active = value === sc.value;
            return (
              <button
                key={sc.value}
                type="button"
                aria-pressed={active}
                onClick={() => onChange(sc.value)}
                className={`border-2 transition-colors ${large ? 'py-4' : 'py-3'} ${
                  active ? 'bg-neutral-900 border-neutral-900 text-white' : 'border-neutral-300 hover:border-neutral-900'
                }`}
              >
                {large ? (
                  <>
                    <span className="block text-xl font-black">{sc.label}</span>
                    <span className={`block text-sm mt-1 px-1 ${active ? 'text-neutral-300' : 'text-neutral-500'}`}>{sc.desc}</span>
                  </>
                ) : (
                  <>
                    <span className="block text-base font-black">{sc.value}</span>
                    <span className={`block text-[11px] mt-0.5 ${active ? 'text-neutral-300' : 'text-neutral-500'}`}>{sc.label}</span>
                  </>
                )}
              </button>
            );
          })}
        </div>
        {allowNA && (
          <button
            type="button"
            aria-pressed={value === NA}
            onClick={() => onChange(NA)}
            className={`mt-2 w-full border-2 border-dashed py-2 text-xs font-bold transition-colors ${
              value === NA ? 'bg-neutral-200 border-neutral-500 text-neutral-900' : 'border-neutral-300 text-neutral-500 hover:border-neutral-900'
            }`}
          >
            관찰 기회 없음
          </button>
        )}
        {item.anchors && (
          <div className="mt-2">
            {anchor ? (
              <p className="text-xs text-neutral-700 border-l-4 border-neutral-900 pl-2 py-0.5 leading-relaxed">
                {value}점 행동 예시: {anchor}
              </p>
            ) : value === NA ? (
              <p className="text-xs text-neutral-500 border-l-4 border-neutral-300 pl-2 py-0.5">이 항목은 달성률 계산에서 제외됩니다.</p>
            ) : null}
            <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1.5 text-xs text-neutral-500 underline hover:text-neutral-900">
              {open ? '행동 예시 접기' : '점수별 행동 예시 보기'}
            </button>
            {open && (
              <ul className="mt-2 border-2 border-neutral-200 divide-y divide-neutral-200 text-xs">
                {scale.map((sc, i) => (
                  <li key={sc.value} className={`flex gap-3 px-3 py-2 leading-relaxed ${value === sc.value ? 'bg-neutral-100 font-semibold' : ''}`}>
                    <span className="w-16 shrink-0 font-bold">
                      {sc.value}점 {sc.label}
                    </span>
                    <span>{item.anchors?.[i]}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 5-1. 링크 평가 화면 (사장님 OJT / 학생 자기평가 공용, 학년별 양식 자동 적용)
// ─────────────────────────────────────────────
type LinkContext = { name: string; grade: string | null; main_field: string | null; site: string | null };

function LinkEvaluationPage({ kind, token }: { kind: LinkKind; token: string }) {
  const isSelf = kind === 'self';
  const [ctx, setCtx] = useState<LinkContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [scores, setScores] = useState<Record<string, number>>({});
  const [summary, setSummary] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [reflections, setReflections] = useState<Record<string, string>>({});
  const [evaluator, setEvaluator] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc('get_link_context', { p_token: token, p_kind: kind });
      if (cancelled) return;
      const row = Array.isArray(data) ? (data[0] as LinkContext | undefined) : undefined;
      if (error || !row) {
        setLoadError(
          isSelf
            ? '링크가 올바르지 않아요. 선생님께 새 링크를 받아 주세요.'
            : '유효하지 않은 평가 링크입니다. 담당 선생님께 새 링크를 요청해 주십시오.'
        );
      } else {
        setCtx(row);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [token, kind, isSelf]);

  const form = formFor(kind, ctx?.grade ?? '');
  const rubric = FORMS[form];
  const items = allItems(rubric);
  const answered = items.filter((i) => scores[i.id] != null).length;

  const handleSubmit = async () => {
    const remaining = items.length - answered;
    if (remaining > 0) {
      setSubmitError(
        isSelf
          ? `아직 고르지 않은 질문이 ${remaining}개 있어요.`
          : `선택하지 않은 항목이 ${remaining}개 있습니다. 관찰할 기회가 없었다면 '관찰 기회 없음'을 눌러 주십시오.`
      );
      return;
    }
    if (!isSelf && !summary) {
      setSubmitError(`'${rubric.summaryTitle}' 항목을 선택해 주십시오.`);
      return;
    }
    const finalComment = isSelf
      ? (rubric.reflections ?? [])
          .filter((r) => reflections[r.key]?.trim())
          .map((r) => `[${r.label}] ${reflections[r.key].trim()}`)
          .join('\n')
      : comment.trim();
    setSubmitting(true);
    setSubmitError('');
    const { error } = await supabase.rpc('submit_link_evaluation', {
      p_token: token,
      p_kind: kind,
      p_form: form,
      p_scores: scores,
      p_summary: isSelf ? null : summary,
      p_comment: finalComment,
      p_evaluator: isSelf ? null : evaluator.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      setSubmitError(isSelf ? '제출하지 못했어요. 잠시 후 다시 눌러 주세요.' : '제출하지 못했습니다. 잠시 후 다시 시도해 주십시오.');
      return;
    }
    setDone(true);
    window.scrollTo({ top: 0 });
  };

  const shell = (children: ReactNode) => (
    <div className="min-h-screen bg-white text-neutral-900 font-sans">
      <header className="border-b-4 border-neutral-900 px-4 py-3 sm:px-6 sm:py-4">
        <p className="text-lg font-black tracking-tighter">
          Link-路 <span className="font-bold text-neutral-500">나라T 직업교육 Lab</span>
        </p>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-6 sm:px-6 sm:py-10">{children}</main>
    </div>
  );

  if (loading)
    return shell(
      <p className="text-lg flex items-center gap-2">
        <Loader2 size={20} className="animate-spin" /> 불러오는 중...
      </p>
    );
  if (loadError || !ctx) return shell(<p className="text-lg font-bold border-l-4 border-neutral-900 pl-4">{loadError}</p>);
  if (done)
    return shell(
      <div className="border-2 border-neutral-900 p-8 sm:p-10 text-center space-y-4">
        <Check size={48} className="mx-auto" strokeWidth={3} />
        {isSelf ? (
          <>
            <p className="text-2xl font-black">제출했어요</p>
            <p className="text-lg">{ctx.name}님, 수고했어요. 선생님이 확인할 거예요.</p>
          </>
        ) : (
          <>
            <p className="text-2xl font-black">평가가 제출되었습니다</p>
            <p className="text-base leading-relaxed">
              사장님의 솔직한 평가가 학생의 실전 취업을 위한 가장 중요한 교육 자료가 됩니다. 시간 내어 주셔서 감사합니다.
              <br />
              다음 평가 때도 같은 링크를 사용하시면 됩니다.
            </p>
          </>
        )}
      </div>
    );

  return shell(
    <div className="space-y-12">
      <div>
        {isSelf ? (
          <>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">{ctx.name}님의 자기평가</h1>
            <p className="text-lg text-neutral-600 mt-3 leading-relaxed">나는 오늘... 스스로 생각하며 질문마다 하나씩 골라 주세요.</p>
          </>
        ) : (
          <>
            <p className="text-sm text-neutral-500">현장실습(OJT) 평가 · {form === 'ojt_senior' ? '취업 실습' : '저학년 현장실습'}</p>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight mt-1">사장님, {ctx.name} 학생을 평가해 주세요</h1>
            <p className="text-sm text-neutral-600 mt-2">{[ctx.site, ctx.main_field, ctx.grade].filter(Boolean).join(' · ')}</p>
            <p className="text-base text-neutral-700 mt-5 leading-relaxed border-l-4 border-neutral-900 pl-4">
              학생이 현장에서 보인 모습을 기준으로 항목마다 하나씩 선택해 주십시오. 관찰할 기회가 없었던 항목은{' '}
              <b>관찰 기회 없음</b>을 누르시면 됩니다. 점수가 고민될 때는 <b>점수별 행동 예시</b>를 참고해 주십시오. 약 5분이
              걸리며, 가입이나 로그인 없이 바로 제출됩니다.
            </p>
          </>
        )}
      </div>

      {!isSelf && (
        <section>
          <h2 className="text-sm font-bold mb-3">평가 기준</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-0.5 bg-neutral-900 border-2 border-neutral-900">
            {rubric.scale.map((sc) => (
              <div key={sc.value} className="bg-white p-4">
                <p className="text-base font-black">
                  {sc.value}점 · {sc.label}
                </p>
                <p className="text-xs text-neutral-500 mt-1 leading-relaxed">{sc.desc}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {rubric.domains.map((domain, di) => (
        <section key={domain.key}>
          <h2 className="text-xl font-bold border-b-4 border-neutral-900 pb-2 mb-1">
            {di + 1}. {domain.title}
          </h2>
          <div className="divide-y divide-neutral-200">
            {domain.items.map((item) => (
              <ItemScorer
                key={item.id}
                item={item}
                scale={rubric.scale}
                allowNA={rubric.allowNA}
                value={scores[item.id]}
                onChange={(v) => setScores((prev) => ({ ...prev, [item.id]: v }))}
                large={isSelf}
              />
            ))}
          </div>
        </section>
      ))}

      {!isSelf && (
        <section>
          <h2 className="text-xl font-bold border-b-4 border-neutral-900 pb-2 mb-4">{rubric.summaryTitle}</h2>
          <div className="space-y-2">
            {rubric.summaryOptions.map((opt) => {
              const active = summary === opt.value;
              return (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 border-2 px-4 py-3 cursor-pointer transition-colors ${
                    active ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 hover:border-neutral-900'
                  }`}
                >
                  <input
                    type="radio"
                    name="link-summary"
                    value={opt.value}
                    checked={active}
                    onChange={() => setSummary(opt.value)}
                    className="accent-neutral-900 mt-1"
                  />
                  <span>
                    <span className="block text-sm font-bold">{opt.label}</span>
                    {opt.desc && <span className={`block text-xs mt-0.5 ${active ? 'text-neutral-300' : 'text-neutral-500'}`}>{opt.desc}</span>}
                  </span>
                </label>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-xl font-bold border-b-4 border-neutral-900 pb-2 mb-4">
          {isSelf ? rubric.commentTitle : '간단 코멘트 (선택)'}
        </h2>
        {isSelf ? (
          <div className="space-y-5">
            {(rubric.reflections ?? []).map((r) => (
              <div key={r.key}>
                <label htmlFor={`refl-${r.key}`} className="block text-lg font-semibold mb-2">
                  {r.label}
                </label>
                <textarea
                  id={`refl-${r.key}`}
                  value={reflections[r.key] ?? ''}
                  onChange={(e) => setReflections((prev) => ({ ...prev, [r.key]: e.target.value }))}
                  maxLength={500}
                  placeholder={r.placeholder}
                  className="w-full h-24 border-2 border-neutral-300 p-4 text-lg focus:outline-none focus:border-neutral-900"
                />
              </div>
            ))}
          </div>
        ) : (
          <>
            <textarea
              id="link-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={2000}
              placeholder={rubric.commentPlaceholder}
              className="w-full h-32 border-2 border-neutral-300 p-4 text-base leading-relaxed focus:outline-none focus:border-neutral-900"
            />
            <div className="mt-4">
              <label htmlFor="link-evaluator" className="block text-sm font-semibold mb-2">
                평가자 성함 (선택)
              </label>
              <input
                id="link-evaluator"
                value={evaluator}
                onChange={(e) => setEvaluator(e.target.value)}
                maxLength={50}
                placeholder="예: 홍길동 점장"
                className={inputClass}
              />
            </div>
          </>
        )}
      </section>

      <div className="space-y-3">
        <p className="text-base text-neutral-600">
          {answered} / {items.length}개 {isSelf ? '골랐어요' : '항목 선택 완료'}
        </p>
        {submitError && <p className="text-base font-bold border-l-4 border-neutral-900 pl-3">{submitError}</p>}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full bg-neutral-900 text-white text-xl font-black py-5 flex items-center justify-center gap-2 hover:bg-neutral-700 transition-colors disabled:opacity-60"
        >
          {submitting ? <Loader2 size={22} className="animate-spin" /> : <Check size={22} strokeWidth={3} />}
          {submitting ? '보내는 중...' : isSelf ? '제출하기' : '평가 제출하기'}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 5-1b. 사장님용 자료 (학생소개서 카드 · 1-Page 포트폴리오) 공통
// ─────────────────────────────────────────────
type Intro = {
  headline: string; // 한 줄 소개
  keywords: string[]; // 키워드 3개
  strength: string; // 이런 점이 강해요
  tip: string; // 이렇게 알려 주세요
  support: string; // 이럴 땐 이렇게 도와주세요
  notes: Record<string, string>; // 영역별 근거 메모 (영역 key → 메모)
};
type IntroTextKey = 'strength' | 'tip' | 'support';
type EvalLite = Pick<EvaluationRow, 'kind' | 'form' | 'scores' | 'summary' | 'evaluated_at'>;
type ShareData = {
  name: string;
  grade: string;
  mainField: string;
  site: string;
  intro: Intro;
  teacher: { name: string; school: string; contact: string };
  ojt: EvalLite | null;
  training: EvalLite | null;
};

const emptyIntro = (): Intro => ({ headline: '', keywords: ['', '', ''], strength: '', tip: '', support: '', notes: {} });

const parseIntro = (raw: unknown): Intro => {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const kw = Array.isArray(o.keywords) ? o.keywords.map(str) : [];
  const notesRaw = o.notes && typeof o.notes === 'object' ? (o.notes as Record<string, unknown>) : {};
  return {
    headline: str(o.headline),
    keywords: [0, 1, 2].map((i) => kw[i] ?? ''),
    strength: str(o.strength),
    tip: str(o.tip),
    support: str(o.support),
    notes: Object.fromEntries(Object.entries(notesRaw).map(([k, v]) => [k, str(v)])),
  };
};

const INTRO_SECTIONS: { key: IntroTextKey; title: string; hint: string; placeholder: string }[] = [
  {
    key: 'strength',
    title: '이런 점이 강해요',
    hint: '학생의 가장 큰 강점',
    placeholder: '예: 한 번 배운 작업은 자리 이탈 없이 끝까지 해냅니다. 단순 반복 업무를 바로 맡기셔도 됩니다.',
  },
  {
    key: 'tip',
    title: '이렇게 알려 주세요',
    hint: '업무를 지시할 때 효과적인 방법',
    placeholder: '예: "이거 하고 저거 해"보다 "1번 박스를 다 접으면, 2번 청소를 시작하세요"처럼 순서를 끊어서 말씀해 주세요.',
  },
  {
    key: 'support',
    title: '이럴 땐 이렇게 도와주세요',
    hint: '당황하거나 어려워할 때 대처법',
    placeholder: '예: 낯선 환경이나 큰 소음에 잠시 멈출 수 있습니다. 다그치기보다 "물 한잔 마시고 5분 뒤에 하자"고 말씀해 주시면 금세 페이스를 찾습니다.',
  },
];

// 영역 달성률 → 수준 라벨 (4점 척도 평균 3.5 / 2.5 / 1.5 기준)
const LEVELS = [
  { min: 87.5, label: '독립 수행', bars: 4 },
  { min: 62.5, label: '최소 지원', bars: 3 },
  { min: 37.5, label: '집중 지원', bars: 2 },
  { min: 0, label: '수행 어려움', bars: 1 },
];
const levelOf = (rate: number) => LEVELS.find((l) => rate >= l.min) ?? LEVELS[LEVELS.length - 1];

const skillRows = (src: EvalLite | null) => {
  if (!src) return [];
  const rubric = rubricOf(src);
  return rubric.domains
    .map((d) => ({
      key: d.key,
      title: d.title.replace(/\s*\(.*\)/, ''),
      rate: rateOrNull(src.scores, d.items.map((i) => i.id), rubric.max),
    }))
    .filter((r): r is { key: string; title: string; rate: number } => r.rate !== null);
};

const parseShared = (raw: unknown): ShareData | null => {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const lite = (v: unknown): EvalLite | null => {
    if (!v || typeof v !== 'object') return null;
    const e = v as Record<string, unknown>;
    return {
      kind: e.kind as Kind,
      form: (e.form as FormKey | null) ?? null,
      scores: (e.scores as Record<string, number>) ?? {},
      summary: (e.summary as string | null) ?? null,
      evaluated_at: str(e.evaluated_at),
    };
  };
  const t = (o.teacher && typeof o.teacher === 'object' ? o.teacher : {}) as Record<string, unknown>;
  return {
    name: str(o.name),
    grade: str(o.grade),
    mainField: str(o.main_field),
    site: str(o.site),
    intro: parseIntro(o.intro),
    teacher: { name: str(t.name), school: str(t.school), contact: str(t.contact) },
    ojt: lite(o.ojt),
    training: lite(o.training),
  };
};

const introLink = (token: string) =>
  `${window.location.origin}${window.location.pathname}?view=intro&t=${encodeURIComponent(token)}${DEMO_SUFFIX}`;

// 이미지 저장: 휴대폰은 공유 창(카카오톡·사진 저장), 컴퓨터는 파일로 내려받기
const exportImage = async (node: HTMLElement, filename: string) => {
  const dataUrl = await toPng(node, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true });
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  if (isTouch && navigator.canShare) {
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], filename, { type: 'image/png' });
    if (navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      return;
    }
  }
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
};

function useImageExport() {
  const [busy, setBusy] = useState(false);
  const run = async (node: HTMLElement | null, filename: string) => {
    if (!node) return;
    setBusy(true);
    try {
      await exportImage(node, filename);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) window.alert('이미지를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

// 이미지용 고정 폭 사본 (화면 밖에 그려 두고 이미지로 변환)
function ExportFrame({ width, nodeRef, children }: { width: number; nodeRef: RefObject<HTMLDivElement | null>; children: ReactNode }) {
  return (
    <div aria-hidden="true" style={{ position: 'fixed', left: -10000, top: 0, width, pointerEvents: 'none' }}>
      <div ref={nodeRef} style={{ width, background: '#ffffff', padding: 24 }}>
        {children}
      </div>
    </div>
  );
}

function LevelBar({ bars }: { bars: number }) {
  return (
    <span className="flex gap-0.5" aria-hidden="true">
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className={`w-4 h-2.5 border border-neutral-900 ${i <= bars ? 'bg-neutral-900' : 'bg-white'}`} />
      ))}
    </span>
  );
}

function TeacherContactLine({ teacher }: { teacher: ShareData['teacher'] }) {
  return (
    <>
      <b>{teacher.name || '담당 교사'}</b>
      {teacher.school ? ` · ${teacher.school}` : ''}
      {teacher.contact ? ` · ${teacher.contact}` : ''}
    </>
  );
}

// 1-Page 포트폴리오 (fixed: 인쇄·이미지용 고정 배치)
function EmployerPortfolioDoc({ data, fixed = false }: { data: ShareData; fixed?: boolean }) {
  const source = data.ojt ?? data.training;
  const rows = skillRows(source);
  const sourceName = data.ojt ? '사업체 현장 평가' : '교내 직무훈련 평가';
  const rubric = source ? rubricOf(source) : null;
  const summary = source && rubric ? rubric.summaryOptions.find((o) => o.value === source.summary) : undefined;
  const keywords = data.intro.keywords.map((k) => k.trim()).filter(Boolean);
  const r = (fixedCls: string, responsiveCls: string) => (fixed ? fixedCls : responsiveCls);

  return (
    <article className={`bg-white text-neutral-900 border-2 border-neutral-900 ${r('p-10', 'p-5 sm:p-10')} print:border-0 print:p-0`}>
      <header className="border-b-4 border-neutral-900 pb-4">
        <p className="text-xs text-neutral-500">현장실습 실무 인재 포트폴리오</p>
        <div className={`flex mt-1 gap-3 ${r('flex-row items-end justify-between', 'flex-col sm:flex-row sm:items-end sm:justify-between')}`}>
          <div>
            <h1 className="text-3xl font-black tracking-tight">{data.name}</h1>
            {data.intro.headline && <p className="text-base font-semibold mt-1">{data.intro.headline}</p>}
          </div>
          <dl className={`text-xs space-y-0.5 ${r('text-right', 'sm:text-right')}`}>
            {(
              [
                ['희망 직무', data.mainField],
                ['실습처', data.site],
                ['학년', data.grade],
              ] as [string, string][]
            )
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k}>
                  <dt className="inline text-neutral-500">{k} </dt>
                  <dd className="inline font-semibold">{v}</dd>
                </div>
              ))}
          </dl>
        </div>
        {keywords.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {keywords.map((k) => (
              <span key={k} className="border border-neutral-900 px-2 py-0.5 text-xs font-semibold">
                #{k.replace(/\s+/g, '_')}
              </span>
            ))}
          </div>
        )}
      </header>

      <section className="py-5 border-b-2 border-neutral-900">
        <div className="flex flex-wrap justify-between items-end gap-2 mb-2">
          <h2 className="text-sm font-bold">전환 핵심 기술 검증 지수</h2>
          <p className="text-[11px] text-neutral-500">{source ? `${source.evaluated_at} ${sourceName} 결과` : '평가 기록 없음'}</p>
        </div>
        {rows.length === 0 ? (
          <p className="text-xs text-neutral-500 py-2">아직 평가 기록이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-neutral-200">
            {rows.map((row) => {
              const lv = levelOf(row.rate);
              const note = data.intro.notes[row.key]?.trim();
              return (
                <li
                  key={row.key}
                  className={`py-2.5 grid items-center gap-x-4 gap-y-1 ${r('grid-cols-[170px_auto_1fr]', 'grid-cols-[1fr_auto] sm:grid-cols-[170px_auto_1fr]')}`}
                >
                  <span className="text-sm font-semibold">{row.title}</span>
                  <span className="flex items-center gap-2">
                    <LevelBar bars={lv.bars} />
                    <span className="text-xs font-bold whitespace-nowrap">{lv.label}</span>
                  </span>
                  <span className={`text-xs text-neutral-600 ${r('', 'col-span-2 sm:col-span-1')}`}>{note}</span>
                </li>
              );
            })}
          </ul>
        )}
        {summary && rubric && (
          <p className="text-xs mt-3 leading-relaxed">
            <span className="text-neutral-500">{rubric.summaryTitle}: </span>
            <b>{summary.label}</b>
            {summary.desc ? ` · ${summary.desc}` : ''}
          </p>
        )}
      </section>

      <section className="py-5 border-b-2 border-neutral-900">
        <h2 className="text-sm font-bold mb-3">사장님을 위한 학생소개서</h2>
        <div className={`grid gap-5 ${r('grid-cols-3', 'grid-cols-1 sm:grid-cols-3')}`}>
          {INTRO_SECTIONS.map((sec) => (
            <div key={sec.key} className="border-t-4 border-neutral-900 pt-2">
              <p className="text-xs font-bold">{sec.title}</p>
              <p className="text-xs leading-relaxed mt-1.5 whitespace-pre-line text-neutral-700">{data.intro[sec.key] || '-'}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className={`pt-4 text-xs flex gap-1 ${r('flex-row justify-between', 'flex-col sm:flex-row sm:justify-between')}`}>
        <p>
          <span className="text-neutral-500">현장실습 담당 교사 </span>
          <TeacherContactLine teacher={data.teacher} />
        </p>
        <p className="text-neutral-500">어떤 상황이든 주저하지 마시고 연락 주십시오.</p>
      </footer>
    </article>
  );
}

// 학생소개서 카드 (카카오톡 이미지 공유용 세로형)
function StudentIntroCard({ data, fixed = false }: { data: ShareData; fixed?: boolean }) {
  const rows = skillRows(data.ojt ?? data.training);
  const keywords = data.intro.keywords.map((k) => k.trim()).filter(Boolean);
  return (
    <article className={`bg-white text-neutral-900 border-2 border-neutral-900 mx-auto ${fixed ? 'w-[420px]' : 'w-full max-w-[420px]'}`}>
      <div className="bg-neutral-900 text-white px-6 py-7">
        <p className="text-[11px] text-neutral-400">사장님을 위한 학생소개서</p>
        <h1 className="text-2xl font-black mt-2 leading-snug">{data.intro.headline || `${data.name}입니다`}</h1>
        <p className="text-sm text-neutral-300 mt-2">
          {[data.name, data.mainField, data.site].filter(Boolean).join(' · ')}
        </p>
        {keywords.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-4">
            {keywords.map((k) => (
              <span key={k} className="border border-white px-2 py-0.5 text-xs font-semibold">
                #{k.replace(/\s+/g, '_')}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="px-6 py-5 space-y-4">
        {INTRO_SECTIONS.map((sec) => (
          <div key={sec.key}>
            <p className="text-xs font-bold border-b-2 border-neutral-900 pb-1">{sec.title}</p>
            <p className="text-sm leading-relaxed mt-2 whitespace-pre-line">{data.intro[sec.key] || '-'}</p>
          </div>
        ))}
        {rows.length > 0 && (
          <div>
            <p className="text-xs font-bold border-b-2 border-neutral-900 pb-1">현장 평가 요약</p>
            <ul className="mt-2 space-y-1.5">
              {rows.map((row) => {
                const lv = levelOf(row.rate);
                return (
                  <li key={row.key} className="flex items-center justify-between gap-3 text-xs">
                    <span>{row.title}</span>
                    <span className="flex items-center gap-2 shrink-0">
                      <LevelBar bars={lv.bars} />
                      <b className="w-16 text-right">{lv.label}</b>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
      <footer className="border-t-2 border-neutral-900 px-6 py-4 text-xs leading-relaxed">
        <p className="font-bold">현장실습 담당 교사 · 돌발 상황 연락처</p>
        <p className="mt-1">
          <TeacherContactLine teacher={data.teacher} />
        </p>
        <p className="text-neutral-500 mt-1">어떤 상황이든 주저하지 마시고 바로 연락 주십시오.</p>
      </footer>
    </article>
  );
}

function DocViewToggle({ value, onChange }: { value: 'card' | 'portfolio'; onChange: (v: 'card' | 'portfolio') => void }) {
  return (
    <div className="grid grid-cols-2 border-2 border-neutral-900 text-xs font-bold">
      {(
        [
          ['card', '학생소개서'],
          ['portfolio', '1-Page 포트폴리오'],
        ] as ['card' | 'portfolio', string][]
      ).map(([k, label], i) => (
        <button
          key={k}
          type="button"
          aria-pressed={value === k}
          onClick={() => onChange(k)}
          className={`px-3 py-2 transition-colors ${i > 0 ? 'border-l-2 border-neutral-900' : ''} ${
            value === k ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-100'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const toolButtonClass =
  'flex items-center gap-2 border-2 border-neutral-900 px-3 py-2 text-sm font-bold hover:bg-neutral-900 hover:text-white transition-colors disabled:opacity-50';

// ─────────────────────────────────────────────
// 5-1c. 사장님이 받는 공유 페이지 (?view=intro&t=토큰, 로그인 없음)
// ─────────────────────────────────────────────
function SharedProfilePage({ token }: { token: string }) {
  const [data, setData] = useState<ShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'card' | 'portfolio'>('card');
  const cardRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<HTMLDivElement>(null);
  const exporter = useImageExport();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: res, error } = await supabase.rpc('get_shared_profile', { p_token: token });
      if (cancelled) return;
      setData(error ? null : parseShared(res));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-neutral-500 gap-2">
        <Loader2 size={16} className="animate-spin" /> 불러오는 중...
      </div>
    );
  if (!data)
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-base font-bold border-l-4 border-neutral-900 pl-4">공유가 중지되었거나 올바르지 않은 링크입니다. 담당 선생님께 문의해 주십시오.</p>
      </div>
    );

  const filename = `${data.name}_${view === 'card' ? '학생소개서' : '포트폴리오'}.png`;
  return (
    <div className="min-h-screen bg-white text-neutral-900 font-sans">
      <header className="border-b-4 border-neutral-900 px-4 py-3 sm:px-6 sm:py-4 print:hidden">
        <p className="text-lg font-black tracking-tighter">
          Link-路 <span className="font-bold text-neutral-500">나라T 직업교육 Lab</span>
        </p>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-6 sm:px-6 sm:py-10 print:p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6 print:hidden">
          <DocViewToggle value={view} onChange={setView} />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => window.print()} className={toolButtonClass}>
              <Printer size={15} /> 인쇄
            </button>
            <button
              type="button"
              disabled={exporter.busy}
              onClick={() => exporter.run(view === 'card' ? cardRef.current : docRef.current, filename)}
              className={toolButtonClass}
            >
              {exporter.busy ? <Loader2 size={15} className="animate-spin" /> : <ImageDown size={15} />} 이미지로 저장
            </button>
          </div>
        </div>
        <div className="print:hidden">{view === 'card' ? <StudentIntroCard data={data} /> : <EmployerPortfolioDoc data={data} />}</div>
        <div className="hidden print:block">{view === 'card' ? <StudentIntroCard data={data} fixed /> : <EmployerPortfolioDoc data={data} fixed />}</div>
      </main>
      <ExportFrame width={468} nodeRef={cardRef}>
        <StudentIntroCard data={data} fixed />
      </ExportFrame>
      <ExportFrame width={842} nodeRef={docRef}>
        <EmployerPortfolioDoc data={data} fixed />
      </ExportFrame>
    </div>
  );
}

// ─────────────────────────────────────────────
// 5-1d. 개인정보 동의 (가입 시 + 동의 내용이 바뀌면 다시 확인)
// ─────────────────────────────────────────────
const CONSENT_VERSION = '2026-10';
const CONSENT_ITEMS: { key: string; title: string; body: string[] }[] = [
  {
    key: 'member',
    title: '[필수] 회원 개인정보 수집·이용 동의',
    body: [
      '수집 항목: 이름, 소속 학교, 이메일 (선택: 연락처)',
      '이용 목적: 가입 승인과 본인 확인, 서비스 운영 안내, 사장님용 자료에 담당 교사 연락처 표시(연락처를 입력한 경우)',
      '보유 기간: 회원 탈퇴 시까지 (탈퇴하면 즉시 삭제)',
      '동의를 거부할 수 있으나, 거부하면 서비스를 이용할 수 없습니다.',
    ],
  },
  {
    key: 'student',
    title: '[필수] 학생 정보 관리 책임 확인',
    body: [
      '학생 정보와 평가 기록의 관리 책임은 입력한 교사에게 있습니다.',
      '소속 학교의 개인정보 처리 절차와 보호자 동의 등 필요한 근거를 확인한 뒤 입력합니다.',
      '평가에 필요한 최소 정보만 입력하며, 장애 유형·진단명·주민등록번호·주소 등은 입력하지 않습니다.',
      '사장님·학생용 평가 링크와 학생소개서 공유 링크는 필요한 사람에게만 전달하고, 필요 없어지면 중지하거나 재발급합니다.',
      '탈퇴하면 입력한 학생 정보와 평가 기록이 모두 삭제됩니다.',
    ],
  },
];
const CONSENT_NOTICE =
  '관리자는 회원 승인을 위해 이름·소속 학교·이메일만 확인하며, 각 선생님의 학생 정보는 열람할 수 없습니다. 데이터는 Supabase 서버(서울 리전)에 저장됩니다.';

function ConsentChecklist({ agreed, onChange }: { agreed: Record<string, boolean>; onChange: (next: Record<string, boolean>) => void }) {
  const all = CONSENT_ITEMS.every((c) => agreed[c.key]);
  return (
    <div className="space-y-3 text-xs">
      <label className="flex items-center gap-2 font-bold text-sm border-b-2 border-neutral-900 pb-2">
        <input
          type="checkbox"
          checked={all}
          onChange={(e) => onChange(Object.fromEntries(CONSENT_ITEMS.map((c) => [c.key, e.target.checked])))}
          className="accent-neutral-900 w-4 h-4"
        />
        모두 동의합니다
      </label>
      {CONSENT_ITEMS.map((c) => (
        <div key={c.key}>
          <label className="flex items-start gap-2 font-semibold">
            <input
              type="checkbox"
              checked={!!agreed[c.key]}
              onChange={(e) => onChange({ ...agreed, [c.key]: e.target.checked })}
              className="accent-neutral-900 w-4 h-4 mt-0.5"
            />
            {c.title}
          </label>
          <details className="ml-6 mt-1">
            <summary className="text-neutral-500 underline cursor-pointer">내용 보기</summary>
            <ul className="mt-1.5 space-y-1 text-neutral-600 leading-relaxed list-disc pl-4">
              {c.body.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </details>
        </div>
      ))}
      <p className="text-neutral-500 leading-relaxed">{CONSENT_NOTICE}</p>
    </div>
  );
}

function ConsentScreen({ profile, onAgreed, onSignOut }: { profile: Profile; onAgreed: (p: Profile) => void; onSignOut: () => void }) {
  const [agreed, setAgreed] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!CONSENT_ITEMS.every((c) => agreed[c.key])) {
      setError('필수 항목에 모두 동의해 주십시오.');
      return;
    }
    setBusy(true);
    setError('');
    const { data, error: err } = await supabase
      .from(PROFILES_TABLE)
      .update({ consent_version: CONSENT_VERSION, consented_at: new Date().toISOString() })
      .eq('id', profile.id)
      .select(PROFILE_COLUMNS)
      .single();
    setBusy(false);
    if (err || !data) {
      setError(`저장하지 못했습니다: ${err?.message ?? '알 수 없는 오류'}`);
      return;
    }
    onAgreed(data as Profile);
  };

  return (
    <AuthShell title="개인정보 동의">
      <p className="text-sm leading-relaxed mb-5">
        학생 정보를 안전하게 다루기 위해 아래 내용에 동의를 받고 있습니다. 동의 내용이 바뀌면 다시 확인을 요청드립니다.
      </p>
      <ConsentChecklist agreed={agreed} onChange={setAgreed} />
      {error && <p className="text-xs font-semibold border-l-4 border-neutral-900 pl-2 py-0.5 mt-4">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="w-full mt-5 flex items-center justify-center gap-2 bg-neutral-900 text-white text-sm font-bold py-3 hover:bg-neutral-700 transition-colors disabled:opacity-60"
      >
        {busy && <Loader2 size={16} className="animate-spin" />} 동의하고 계속하기
      </button>
      <button type="button" onClick={onSignOut} className="w-full mt-2 text-xs text-neutral-500 underline py-2">
        동의하지 않고 로그아웃
      </button>
    </AuthShell>
  );
}

// ─────────────────────────────────────────────
// 5-2. 로그인 · 가입 · 승인 대기
// ─────────────────────────────────────────────
function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-neutral-900 font-sans flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <p className="text-2xl font-black tracking-tighter">Link-路 <span className="font-bold text-neutral-500">나라T 직업교육 Lab</span></p>
        <p className="text-sm text-neutral-500 mt-1 mb-8">현장실습 직무 역량 평가</p>
        <div className="border-2 border-neutral-900 p-6 sm:p-8">
          <h1 className="text-lg font-bold border-b-4 border-neutral-900 pb-2 mb-6">{title}</h1>
          {children}
        </div>
      </div>
    </div>
  );
}

const authErrorMessage = (msg: string) => {
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return '이메일 또는 비밀번호가 올바르지 않습니다.';
  if (m.includes('email not confirmed')) return '이메일 인증이 아직 완료되지 않았습니다. 받은편지함과 스팸함에서 인증 메일을 확인하십시오.';
  if (m.includes('already registered')) return '이미 가입된 이메일입니다. 로그인하거나 비밀번호를 재설정하십시오.';
  if (m.includes('rate limit')) return '메일 발송 한도를 초과했습니다. 잠시 후 다시 시도하십시오.';
  if (m.includes('password')) return `비밀번호 조건을 확인하십시오: ${msg}`;
  return `처리하지 못했습니다: ${msg}`;
};

type AuthMode = 'login' | 'signup' | 'reset' | 'find';
type FoundEmail = { masked: string; confirmed: boolean };
const CONTACT_NOTE = '그래도 해결되지 않으면 전북 중등 특수교사 김나라 선생님께 JB메신저로 문의해 주세요.';

function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [school, setSchool] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [agreed, setAgreed] = useState<Record<string, boolean>>({});
  const [findName, setFindName] = useState('');
  const [findSchool, setFindSchool] = useState('');
  const [found, setFound] = useState<FoundEmail[] | null>(null);

  const switchMode = (m: AuthMode) => {
    setMode(m);
    setError('');
    setInfo('');
    setFound(null);
  };

  const redirectTo = `${window.location.origin}${window.location.pathname}`;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setInfo('');
    const mail = email.trim();
    if (!mail) return setError('이메일을 입력하십시오.');
    if (mode === 'signup') {
      if (!name.trim() || !school.trim()) return setError('이름과 소속 학교를 입력하십시오.');
      if (password.length < 8) return setError('비밀번호는 8자 이상으로 정하십시오.');
      if (!CONSENT_ITEMS.every((c) => agreed[c.key])) return setError('필수 동의 항목에 모두 체크해 주십시오.');
    }
    if (mode !== 'reset' && !password) return setError('비밀번호를 입력하십시오.');

    setBusy(true);
    if (mode === 'login') {
      const { error: err } = await supabase.auth.signInWithPassword({ email: mail, password });
      if (err) setError(authErrorMessage(err.message));
    } else if (mode === 'signup') {
      const { data, error: err } = await supabase.auth.signUp({
        email: mail,
        password,
        options: { emailRedirectTo: redirectTo, data: { name: name.trim(), school: school.trim(), consent_version: CONSENT_VERSION } },
      });
      if (err) setError(authErrorMessage(err.message));
      else if (!data.session)
        setInfo('인증 메일을 보냈습니다. 메일의 링크를 누르면 가입이 완료되고, 관리자 승인 후 이용할 수 있습니다. 메일이 보이지 않으면 스팸함을 확인하십시오.');
    } else {
      const { error: err } = await supabase.auth.resetPasswordForEmail(mail, { redirectTo });
      if (err) setError(authErrorMessage(err.message));
      else setInfo('비밀번호 재설정 메일을 보냈습니다. 메일의 링크를 눌러 새 비밀번호를 정하십시오.');
    }
    setBusy(false);
  };

  const findEmail = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setFound(null);
    if (findName.trim().length < 2 || findSchool.trim().length < 2) return setError('가입할 때 입력한 이름과 소속 학교를 입력하십시오.');
    setBusy(true);
    const { data, error: err } = await supabase.rpc('find_portfolio_email', { p_name: findName.trim(), p_school: findSchool.trim() });
    setBusy(false);
    if (err) return setError(`찾지 못했습니다: ${err.message}`);
    setFound(Array.isArray(data) ? (data as FoundEmail[]) : []);
  };

  if (mode === 'find') {
    return (
      <AuthShell title="가입한 이메일 찾기">
        <p className="text-xs text-neutral-600 leading-relaxed mb-4">가입할 때 입력한 이름과 소속 학교를 정확히 입력하면, 가입한 이메일의 일부를 보여 드립니다.</p>
        <form onSubmit={findEmail} className="space-y-3">
          <input className={inputClass} placeholder="이름" value={findName} onChange={(e) => setFindName(e.target.value)} autoComplete="name" />
          <input className={inputClass} placeholder="소속 학교 (예: 나라고등학교)" value={findSchool} onChange={(e) => setFindSchool(e.target.value)} />
          {error && <p className="text-xs font-semibold border-l-4 border-neutral-900 pl-2 py-0.5">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 bg-neutral-900 text-white text-sm font-bold py-3 hover:bg-neutral-700 transition-colors disabled:opacity-60"
          >
            {busy && <Loader2 size={16} className="animate-spin" />} 이메일 찾기
          </button>
        </form>
        {found && (
          <div className="mt-5 border-2 border-neutral-900 p-4 text-sm">
            {found.length === 0 ? (
              <p className="text-xs leading-relaxed">
                일치하는 가입 정보가 없습니다. 이름과 학교를 가입할 때와 똑같이 입력했는지 확인해 주세요. 학교를 옮긴 뒤 [내 정보]에서 학교를 바꾸셨다면 새 학교로 입력합니다.
              </p>
            ) : (
              <>
                <p className="text-xs text-neutral-500 mb-2">가입한 이메일</p>
                <ul className="space-y-1">
                  {found.map((f) => (
                    <li key={f.masked} className="font-bold tracking-wide">
                      {f.masked}
                      {!f.confirmed && <span className="ml-2 text-[11px] font-normal text-neutral-500">(메일 인증 전)</span>}
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-neutral-500 mt-3 leading-relaxed">
                  이메일이 생각나셨다면 로그인해 주세요. 비밀번호가 기억나지 않으면 [비밀번호 재설정]을 이용하세요.
                </p>
              </>
            )}
          </div>
        )}
        <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs text-neutral-500">
          <button type="button" onClick={() => switchMode('login')} className="underline hover:text-neutral-900">
            로그인으로 돌아가기
          </button>
          <button type="button" onClick={() => switchMode('reset')} className="underline hover:text-neutral-900">
            비밀번호 재설정
          </button>
        </div>
        <p className="mt-4 text-[11px] text-neutral-400 leading-relaxed">{CONTACT_NOTE}</p>
      </AuthShell>
    );
  }

  const title = mode === 'login' ? '교사 로그인' : mode === 'signup' ? '교사 가입 신청' : '비밀번호 재설정';

  return (
    <AuthShell title={title}>
      {mode !== 'reset' && (
        <div className="grid grid-cols-2 border-2 border-neutral-900 mb-6">
          {(['login', 'signup'] as AuthMode[]).map((m, i) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className={`py-2 text-sm font-bold transition-colors ${i > 0 ? 'border-l-2 border-neutral-900' : ''} ${
                mode === m ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-100'
              }`}
            >
              {m === 'login' ? '로그인' : '가입 신청'}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-3">
        {mode === 'signup' && (
          <>
            <input className={inputClass} placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            <input className={inputClass} placeholder="소속 학교" value={school} onChange={(e) => setSchool(e.target.value)} />
          </>
        )}
        <input
          className={inputClass}
          type="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        {mode === 'signup' && (
          <p className="text-[11px] text-neutral-500 leading-relaxed -mt-1">
            앞으로 계속 쓸 이메일로 가입해 주세요. 이메일은 로그인 아이디가 되며, 가입 후에는 바꿀 수 없습니다.
          </p>
        )}
        {mode !== 'reset' && (
          <input
            className={inputClass}
            type="password"
            placeholder={mode === 'signup' ? '비밀번호 (8자 이상)' : '비밀번호'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          />
        )}
        {mode === 'signup' && (
          <div className="border-2 border-neutral-200 p-3">
            <ConsentChecklist agreed={agreed} onChange={setAgreed} />
          </div>
        )}
        {error && <p className="text-xs font-semibold border-l-4 border-neutral-900 pl-2 py-0.5">{error}</p>}
        {info && <p className="text-xs border-l-4 border-neutral-400 pl-2 py-0.5 text-neutral-700 leading-relaxed">{info}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 bg-neutral-900 text-white text-sm font-bold py-3 hover:bg-neutral-700 transition-colors disabled:opacity-60"
        >
          {busy && <Loader2 size={16} className="animate-spin" />}
          {mode === 'login' ? '로그인' : mode === 'signup' ? '가입 신청' : '재설정 메일 보내기'}
        </button>
      </form>
      <div className="mt-5 text-xs text-neutral-500">
        {mode === 'reset' ? (
          <button type="button" onClick={() => switchMode('login')} className="underline hover:text-neutral-900">
            로그인으로 돌아가기
          </button>
        ) : mode === 'login' ? (
          <>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <button type="button" onClick={() => switchMode('reset')} className="underline hover:text-neutral-900">
                비밀번호를 잊으셨나요?
              </button>
              <button type="button" onClick={() => switchMode('find')} className="underline hover:text-neutral-900">
                가입한 이메일 찾기
              </button>
            </div>
            <p className="mt-4 text-[11px] text-neutral-400 leading-relaxed">{CONTACT_NOTE}</p>
          </>
        ) : (
          <p className="leading-relaxed">가입 후 이메일 인증을 마치면 관리자 승인을 거쳐 교사 권한이 부여됩니다.</p>
        )}
      </div>
    </AuthShell>
  );
}

function NewPasswordScreen({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (password.length < 8) return setError('비밀번호는 8자 이상으로 정하십시오.');
    if (password !== confirm) return setError('두 비밀번호가 일치하지 않습니다.');
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) return setError(authErrorMessage(err.message));
    onDone();
  };

  return (
    <AuthShell title="새 비밀번호 설정">
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          className={inputClass}
          type="password"
          placeholder="새 비밀번호 (8자 이상)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
        <input
          className={inputClass}
          type="password"
          placeholder="새 비밀번호 확인"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
        {error && <p className="text-xs font-semibold border-l-4 border-neutral-900 pl-2 py-0.5">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 bg-neutral-900 text-white text-sm font-bold py-3 hover:bg-neutral-700 transition-colors disabled:opacity-60"
        >
          {busy && <Loader2 size={16} className="animate-spin" />}
          비밀번호 변경
        </button>
      </form>
    </AuthShell>
  );
}

function PendingScreen({
  email,
  error,
  onRefresh,
  onSignOut,
}: {
  email: string;
  error: string;
  onRefresh: () => void;
  onSignOut: () => void;
}) {
  return (
    <AuthShell title="승인 대기 중">
      <p className="text-sm leading-relaxed">
        <b>{email}</b> 계정으로 가입되었습니다. 관리자가 교사 권한을 승인하면 바로 이용할 수 있습니다.
      </p>
      {error && <p className="text-xs font-semibold border-l-4 border-neutral-900 pl-2 py-0.5 mt-4">{error}</p>}
      <div className="grid grid-cols-2 gap-2 mt-6">
        <button
          type="button"
          onClick={onRefresh}
          className="flex items-center justify-center gap-2 border-2 border-neutral-900 py-2.5 text-sm font-bold hover:bg-neutral-900 hover:text-white transition-colors"
        >
          <RefreshCw size={15} /> 다시 확인
        </button>
        <button
          type="button"
          onClick={onSignOut}
          className="flex items-center justify-center gap-2 border-2 border-neutral-300 py-2.5 text-sm font-bold hover:border-neutral-900 transition-colors"
        >
          <LogOut size={15} /> 로그아웃
        </button>
      </div>
    </AuthShell>
  );
}

function AuthGate() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;

  const loadProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      return;
    }
    setProfileLoading(true);
    setProfileError('');
    const { data, error } = await supabase.from(PROFILES_TABLE).select(PROFILE_COLUMNS).eq('id', userId).maybeSingle();
    if (error) setProfileError(`계정 정보를 불러오지 못했습니다: ${error.message}`);
    setProfile((data as Profile | null) ?? null);
    setProfileLoading(false);
  }, [userId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  const loadingView = (
    <div className="min-h-screen flex items-center justify-center text-sm text-neutral-500 gap-2">
      <Loader2 size={16} className="animate-spin" /> 불러오는 중...
    </div>
  );

  if (!ready) return loadingView;
  if (recovery && session) return <NewPasswordScreen onDone={() => setRecovery(false)} />;
  if (!session) return <AuthScreen />;
  if (profileLoading && !profile) return loadingView;
  if (profile && profile.consent_version !== CONSENT_VERSION) {
    return <ConsentScreen profile={profile} onAgreed={setProfile} onSignOut={signOut} />;
  }
  if (!profile || (profile.role !== 'teacher' && profile.role !== 'admin')) {
    return <PendingScreen email={session.user.email ?? ''} error={profileError} onRefresh={loadProfile} onSignOut={signOut} />;
  }
  return <TeacherApp profile={profile} onSignOut={signOut} onProfileUpdated={setProfile} />;
}

// ─────────────────────────────────────────────
// 6. 교사용 앱
// ─────────────────────────────────────────────
type NavView = 'dashboard' | 'share' | 'members' | 'profile';
type Tab = 'new' | 'history' | 'insight' | 'employer';
type PrintTarget = 'insight' | 'portfolio' | 'card';

function TeacherApp({
  profile,
  onSignOut,
  onProfileUpdated,
}: {
  profile: Profile;
  onSignOut: () => void;
  onProfileUpdated: (p: Profile) => void;
}) {
  const isAdmin = profile.role === 'admin';
  const [students, setStudents] = useState<Student[]>([]); // 사용 중인 학생
  const [trashed, setTrashed] = useState<Student[]>([]); // 휴지통 (30일 보관)
  const [showTrash, setShowTrash] = useState(false);
  const [undoStudent, setUndoStudent] = useState<Student | null>(null); // 방금 휴지통으로 옮긴 학생
  const undoTimer = useRef<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nav, setNav] = useState<NavView>('dashboard');
  const [tab, setTab] = useState<Tab>('insight');
  const [form, setForm] = useState({ name: '', grade: GRADES[0], mainField: '', site: '' });
  const [formError, setFormError] = useState('');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft('teacher'));
  const [draftError, setDraftError] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [regenId, setRegenId] = useState<string | null>(null);
  const [members, setMembers] = useState<Profile[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState('');
  const [pfName, setPfName] = useState(profile.name);
  const [pfSchool, setPfSchool] = useState(profile.school);
  const [pfContact, setPfContact] = useState(profile.contact ?? '');
  const [pfSaving, setPfSaving] = useState(false);
  const [pfMsg, setPfMsg] = useState<FormMessage | null>(null);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<FormMessage | null>(null);
  const [delEmail, setDelEmail] = useState('');
  const [delBusy, setDelBusy] = useState(false);
  const [delError, setDelError] = useState('');
  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  const [unseen, setUnseen] = useState<Record<string, number>>({});
  const [liveStatus, setLiveStatus] = useState<LiveStatus>('connecting');
  const [studentQuery, setStudentQuery] = useState('');
  const [groupByGrade, setGroupByGrade] = useState<boolean>(() => {
    try {
      return localStorage.getItem('pf-group-by-grade') === '1';
    } catch {
      return false;
    }
  });
  const [collapsedGrades, setCollapsedGrades] = useState<Record<string, boolean>>({});
  const [mobilePane, setMobilePane] = useState<'list' | 'detail'>('list'); // 휴대폰: 목록 ↔ 상세 전환
  const [showAddForm, setShowAddForm] = useState(false); // 휴대폰: 학생 추가 양식 접기
  const [printTarget, setPrintTarget] = useState<PrintTarget>('insight');
  const [docView, setDocView] = useState<'card' | 'portfolio'>('card');
  const [introDraft, setIntroDraft] = useState<Intro>(emptyIntro());
  const [introDirty, setIntroDirty] = useState(false);
  const [introSaving, setIntroSaving] = useState(false);
  const [introMsg, setIntroMsg] = useState<FormMessage | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<HTMLDivElement>(null);
  const exporter = useImageExport();
  const savingKeyRef = useRef<string | null>(null); // 내가 지금 저장 중인 평가 (알림 중복 방지)
  const studentsRef = useRef<Student[]>([]);

  const selected = students.find((s) => s.id === selectedId) ?? null;

  // 학생을 바꾸면 학생소개서 작성란을 그 학생의 저장된 내용으로 채움
  useEffect(() => {
    const st = students.find((x) => x.id === selectedId);
    setIntroDraft(st ? st.intro : emptyIntro());
    setIntroDirty(false);
    setIntroMsg(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, loading]);

  // ── 불러오기 ──
  const fetchStudents = useCallback(async () => {
    setLoadError('');
    const { data, error } = await supabase
      .from(STUDENTS_TABLE)
      .select(`${STUDENT_COLUMNS}, ${EVALUATIONS_TABLE}(${EVAL_COLUMNS})`)
      .order('created_at', { ascending: true });
    if (error) {
      setLoadError(`데이터를 불러오지 못했습니다: ${error.message}`);
    } else {
      const all = ((data ?? []) as unknown as StudentRow[]).map(toStudent);
      const cutoff = Date.now() - TRASH_DAYS * 24 * 60 * 60 * 1000;
      const expired = all.filter((st) => st.deletedAt && new Date(st.deletedAt).getTime() < cutoff);
      for (const st of expired) await supabase.from(STUDENTS_TABLE).delete().eq('id', st.id);
      const list = all.filter((st) => !st.deletedAt);
      setStudents(list);
      setTrashed(all.filter((st) => st.deletedAt && !expired.includes(st)));
      setSelectedId((prev) => (prev && list.some((s) => s.id === prev) ? prev : list[0]?.id ?? null));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  useEffect(() => {
    studentsRef.current = students;
  }, [students]);

  // ── 실시간 반영: 사장님·학생이 링크로 제출하면 새로고침 없이 바로 추가 ──
  useEffect(() => {
    let wasDisconnected = false;
    const channel = supabase
      .channel('portfolio-evaluations-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: EVALUATIONS_TABLE }, (payload) => {
        const row = normalizeEval(payload.new as unknown as RawEvaluationRow);
        const owner = studentsRef.current.find((st) => st.id === row.student_id);
        if (!owner || owner.evaluations.some((e) => e.id === row.id)) return;
        setStudents((prev) =>
          prev.map((st) =>
            st.id === row.student_id && !st.evaluations.some((e) => e.id === row.id)
              ? { ...st, evaluations: [...st.evaluations, row].sort(byTimeAsc) }
              : st
          )
        );
        if (savingKeyRef.current === `${row.student_id}:${row.kind}`) return; // 내가 방금 저장한 평가는 알림 생략
        setArrivals((prev) =>
          [
            { id: row.id, studentId: owner.id, studentName: owner.name, kind: row.kind, evaluator: row.evaluator, rate: overallRate(row) },
            ...prev,
          ].slice(0, 4)
        );
        setUnseen((prev) => ({ ...prev, [owner.id]: (prev[owner.id] ?? 0) + 1 }));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: EVALUATIONS_TABLE }, (payload) => {
        const id = (payload.old as { id?: string }).id;
        if (!id) return;
        setStudents((prev) =>
          prev.map((st) => (st.evaluations.some((e) => e.id === id) ? { ...st, evaluations: st.evaluations.filter((e) => e.id !== id) } : st))
        );
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setLiveStatus('live');
          if (wasDisconnected) fetchStudents(); // 연결이 끊긴 동안 들어온 평가 다시 불러오기
          wasDisconnected = false;
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setLiveStatus('offline');
          wasDisconnected = true;
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchStudents]);

  const dismissArrival = (id: string) => setArrivals((prev) => prev.filter((a) => a.id !== id));

  // ── 학생 검색 (이름·직무·실습처) / 학년별 묶기 ──
  const filteredStudents = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    if (!q) return students;
    return students.filter((st) => [st.name, st.mainField, st.site].some((v) => v.toLowerCase().includes(q)));
  }, [students, studentQuery]);

  const gradeGroups = useMemo(() => {
    const order = [...GRADES, ...Array.from(new Set(filteredStudents.map((st) => st.grade))).filter((g) => !GRADES.includes(g))];
    return order
      .map((grade) => ({
        grade,
        list: filteredStudents.filter((st) => st.grade === grade).sort((a, b) => a.name.localeCompare(b.name, 'ko')),
      }))
      .filter((g) => g.list.length > 0);
  }, [filteredStudents]);

  const toggleGroupByGrade = (on: boolean) => {
    setGroupByGrade(on);
    try {
      localStorage.setItem('pf-group-by-grade', on ? '1' : '0');
    } catch {
      // 저장 실패는 무시 (다음 접속 때 기본값 사용)
    }
  };

  const fieldOptions = useMemo(
    () => Array.from(new Set([...FIELD_SUGGESTIONS, ...students.map((s) => s.mainField)])).filter(Boolean),
    [students]
  );

  const selectStudent = (id: string) => {
    setSelectedId(id);
    setMobilePane('detail');
    if (window.innerWidth < 768) window.scrollTo({ top: 0 });
    setUnseen((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setDraft((d) => emptyDraft(d.kind));
    setDraftError('');
    setNotice('');
  };

  // ── 학생 추가 / 삭제 ──
  const handleAdd = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.name.trim() || !form.mainField.trim()) {
      setFormError('이름과 희망 직무/실습 분야를 입력하십시오.');
      return;
    }
    setAdding(true);
    setFormError('');
    const { data, error } = await supabase
      .from(STUDENTS_TABLE)
      .insert({ name: form.name.trim(), grade: form.grade, main_field: form.mainField.trim(), site: form.site.trim() || null })
      .select(STUDENT_COLUMNS)
      .single();
    setAdding(false);
    if (error || !data) {
      setFormError(`추가하지 못했습니다: ${error?.message ?? '알 수 없는 오류'}`);
      return;
    }
    const student = toStudent({ ...(data as Omit<StudentRow, 'portfolio_evaluations'>), portfolio_evaluations: [] });
    setStudents((prev) => [...prev, student]);
    selectStudent(student.id);
    setTab('new');
    setForm({ name: '', grade: form.grade, mainField: '', site: '' });
    setShowAddForm(false);
  };

  const handleDeleteStudent = async (student: Student) => {
    if (!window.confirm(`${student.name} 학생을 휴지통으로 옮길까요?\n${TRASH_DAYS}일 안에는 [휴지통]에서 평가 기록까지 그대로 되살릴 수 있습니다.`)) return;
    const deletedAt = new Date().toISOString();
    const { error } = await supabase.from(STUDENTS_TABLE).update({ deleted_at: deletedAt }).eq('id', student.id);
    if (error) {
      window.alert(`휴지통으로 옮기지 못했습니다: ${error.message}`);
      return;
    }
    const remaining = students.filter((s) => s.id !== student.id);
    setStudents(remaining);
    setTrashed((prev) => [{ ...student, deletedAt }, ...prev]);
    if (selectedId === student.id) setSelectedId(remaining[0]?.id ?? null);
    setUndoStudent(student);
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    undoTimer.current = window.setTimeout(() => setUndoStudent(null), 10000);
  };

  const restoreStudent = async (student: Student) => {
    const { error } = await supabase.from(STUDENTS_TABLE).update({ deleted_at: null }).eq('id', student.id);
    if (error) {
      window.alert(`되살리지 못했습니다: ${error.message}`);
      return;
    }
    setTrashed((prev) => prev.filter((s) => s.id !== student.id));
    setStudents((prev) => [...prev, { ...student, deletedAt: null }]);
    setUndoStudent((u) => (u?.id === student.id ? null : u));
    setSelectedId(student.id);
  };

  const purgeStudent = async (student: Student) => {
    if (!window.confirm(`${student.name} 학생과 모든 평가 기록을 완전히 삭제합니다. 이 작업은 되돌릴 수 없습니다. 계속할까요?`)) return;
    const { error } = await supabase.from(STUDENTS_TABLE).delete().eq('id', student.id);
    if (error) {
      window.alert(`삭제하지 못했습니다: ${error.message}`);
      return;
    }
    setTrashed((prev) => prev.filter((s) => s.id !== student.id));
  };

  const daysLeft = (deletedAt: string) =>
    Math.max(0, TRASH_DAYS - Math.floor((Date.now() - new Date(deletedAt).getTime()) / (24 * 60 * 60 * 1000)));

  // ── 새 평가 저장 (누적 insert) ──
  const changeDraftKind = (kind: StaffKind) => {
    if (kind === draft.kind) return;
    const hasInput = Object.keys(draft.scores).length > 0 || draft.comment.trim() !== '' || draft.evaluator.trim() !== '';
    if (hasInput && !window.confirm('입력 중인 내용이 지워집니다. 평가 종류를 바꿀까요?')) return;
    setDraft(emptyDraft(kind));
    setDraftError('');
  };

  const handleSaveDraft = async () => {
    if (!selected) return;
    const draftForm = formFor(draft.kind, selected.grade);
    const rubric = FORMS[draftForm];
    const missing = allItems(rubric).filter((i) => draft.scores[i.id] == null).length;
    if (missing > 0) {
      setDraftError(`채점하지 않은 항목이 ${missing}개 있습니다.`);
      return;
    }
    if (!draft.summary) {
      setDraftError(`${rubric.summaryTitle}을(를) 선택하십시오.`);
      return;
    }
    if (draft.kind === 'ojt' && !draft.method) {
      setDraftError('대리 입력 방식(전화 평가 / 종이 평가지 / 현장 면담)을 선택하십시오.');
      return;
    }
    if (draft.kind === 'ojt' && !draft.evaluator.trim()) {
      setDraftError('평가해 주신 사장님(담당자) 성함을 입력하십시오.');
      return;
    }
    if (!draft.date) {
      setDraftError('평가일을 입력하십시오.');
      return;
    }
    setSaving(true);
    setDraftError('');
    savingKeyRef.current = `${selected.id}:${draft.kind}`;
    const { data, error } = await supabase
      .from(EVALUATIONS_TABLE)
      .insert({
        student_id: selected.id,
        kind: draft.kind,
        form: draftForm,
        scores: draft.scores,
        summary: draft.summary,
        comment: draft.comment.trim(),
        evaluated_at: draft.date,
        input_method: draft.kind === 'ojt' ? draft.method : null,
        evaluator: draft.kind === 'ojt' ? draft.evaluator.trim() : null,
      })
      .select(EVAL_COLUMNS)
      .single();
    setSaving(false);
    window.setTimeout(() => {
      savingKeyRef.current = null;
    }, 3000);
    if (error || !data) {
      setDraftError(`저장하지 못했습니다: ${error?.message ?? '알 수 없는 오류'}`);
      return;
    }
    const row = normalizeEval(data as unknown as RawEvaluationRow);
    setStudents((prev) =>
      prev.map((s) =>
        s.id === selected.id && !s.evaluations.some((e) => e.id === row.id)
          ? { ...s, evaluations: [...s.evaluations, row].sort(byTimeAsc) }
          : s
      )
    );
    setNotice(`${row.evaluated_at} ${rubric.label} 기록이 저장되었습니다.`);
    setDraft(emptyDraft(draft.kind));
    setTab('history');
  };

  const handleDeleteEvaluation = async (row: EvaluationRow) => {
    if (!window.confirm(`${row.evaluated_at} ${KIND_LABEL[row.kind]} 평가를 삭제할까요?`)) return;
    const { error } = await supabase.from(EVALUATIONS_TABLE).delete().eq('id', row.id);
    if (error) {
      window.alert(`삭제하지 못했습니다: ${error.message}`);
      return;
    }
    setStudents((prev) =>
      prev.map((s) => (s.id === row.student_id ? { ...s, evaluations: s.evaluations.filter((e) => e.id !== row.id) } : s))
    );
  };

  // ── 평가 링크 복사 / 재발급 ──
  const copyLink = async (student: Student, kind: LinkKind) => {
    const url = linkFor(kind, kind === 'ojt' ? student.employerToken : student.selfToken);
    const key = `${student.id}:${kind}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000);
    } catch {
      window.prompt('아래 링크를 복사해 보내 주세요.', url);
    }
  };

  const regenerateLinks = async (student: Student) => {
    if (!window.confirm(`${student.name} 학생의 사장님 평가 링크와 자기평가 링크를 새로 만듭니다. 기존 링크는 더 이상 열리지 않습니다. 계속할까요?`)) return;
    setRegenId(student.id);
    const { data, error } = await supabase
      .from(STUDENTS_TABLE)
      .update({ self_token: crypto.randomUUID(), employer_token: crypto.randomUUID() })
      .eq('id', student.id)
      .select('self_token, employer_token')
      .single();
    setRegenId(null);
    if (error || !data) {
      window.alert(`재발급하지 못했습니다: ${error?.message ?? '알 수 없는 오류'}`);
      return;
    }
    const tokens = data as { self_token: string; employer_token: string };
    setStudents((prev) =>
      prev.map((s) => (s.id === student.id ? { ...s, selfToken: tokens.self_token, employerToken: tokens.employer_token } : s))
    );
  };

  // ── 회원 승인 (관리자) ──
  const fetchMembers = useCallback(async () => {
    if (!isAdmin) return;
    setMembersLoading(true);
    setMembersError('');
    const { data, error } = await supabase.from(PROFILES_TABLE).select(PROFILE_COLUMNS).order('created_at', { ascending: false });
    if (error) setMembersError(`회원 목록을 불러오지 못했습니다: ${error.message}`);
    else setMembers((data ?? []) as Profile[]);
    setMembersLoading(false);
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin && (nav === 'members' || members.length === 0)) fetchMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav, isAdmin, fetchMembers]);

  // ── 내 정보 ──
  const saveProfile = async () => {
    if (!pfName.trim() || !pfSchool.trim()) {
      setPfMsg({ type: 'error', text: '이름과 소속 학교를 입력하십시오.' });
      return;
    }
    setPfSaving(true);
    setPfMsg(null);
    const { data, error } = await supabase
      .from(PROFILES_TABLE)
      .update({ name: pfName.trim(), school: pfSchool.trim(), contact: pfContact.trim() || null })
      .eq('id', profile.id)
      .select(PROFILE_COLUMNS)
      .single();
    setPfSaving(false);
    if (error || !data) {
      setPfMsg({ type: 'error', text: `저장하지 못했습니다: ${error?.message ?? '알 수 없는 오류'}` });
      return;
    }
    onProfileUpdated(data as Profile);
    setPfMsg({ type: 'ok', text: '저장되었습니다.' });
  };

  const changePassword = async () => {
    if (pw.length < 8) {
      setPwMsg({ type: 'error', text: '비밀번호는 8자 이상으로 정하십시오.' });
      return;
    }
    if (pw !== pw2) {
      setPwMsg({ type: 'error', text: '두 비밀번호가 일치하지 않습니다.' });
      return;
    }
    setPwBusy(true);
    setPwMsg(null);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setPwBusy(false);
    if (error) {
      setPwMsg({ type: 'error', text: authErrorMessage(error.message) });
      return;
    }
    setPw('');
    setPw2('');
    setPwMsg({ type: 'ok', text: '비밀번호가 변경되었습니다. 다음 로그인부터 새 비밀번호를 사용하십시오.' });
  };

  const deleteAccount = async () => {
    if (delEmail.trim().toLowerCase() !== profile.email.toLowerCase()) {
      setDelError('이메일이 일치하지 않습니다.');
      return;
    }
    if (!window.confirm(`정말 탈퇴할까요?\n학생 ${students.length}명과 평가 기록이 모두 삭제되며 되돌릴 수 없습니다.`)) return;
    setDelBusy(true);
    setDelError('');
    const { error } = await supabase.rpc('delete_my_portfolio_account');
    if (error) {
      setDelBusy(false);
      setDelError(`탈퇴하지 못했습니다: ${error.message}`);
      return;
    }
    window.alert('탈퇴가 완료되었습니다. 그동안 이용해 주셔서 감사합니다.');
    onSignOut();
  };

  const deleteUnconfirmed = async (member: Profile) => {
    if (!window.confirm(`${member.email} 가입 신청을 삭제할까요?\n메일 인증을 하지 않은 계정입니다. 이메일을 잘못 입력했다면 올바른 주소로 다시 가입하도록 안내해 주세요.`)) return;
    const { error } = await supabase.rpc('delete_unconfirmed_member', { p_user: member.id });
    if (error) {
      window.alert(`삭제하지 못했습니다: ${error.message}`);
      return;
    }
    setMembers((prev) => prev.filter((m) => m.id !== member.id));
  };

  const changeRole = async (member: Profile, role: Role) => {
    const msg =
      role === 'teacher'
        ? `${member.name || member.email} 선생님에게 교사 권한을 부여할까요?`
        : `${member.name || member.email} 선생님의 교사 권한을 해제할까요? 해제해도 그 선생님의 학생 데이터는 삭제되지 않습니다.`;
    if (!window.confirm(msg)) return;
    const { error } = await supabase.from(PROFILES_TABLE).update({ role }).eq('id', member.id);
    if (error) {
      window.alert(`변경하지 못했습니다: ${error.message}`);
      return;
    }
    setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, role } : m)));
  };

  // ─────────────────────────────────────────
  // 화면 조각
  // ─────────────────────────────────────────
  const navItems: { key: NavView; label: string; icon: ReactNode }[] = [
    { key: 'dashboard', label: '학생 대시보드', icon: <LayoutDashboard size={20} /> },
    { key: 'share', label: '평가 링크 공유', icon: <Share2 size={20} /> },
    ...(isAdmin ? [{ key: 'members' as NavView, label: '회원 승인', icon: <Users size={20} /> }] : []),
    { key: 'profile', label: '내 정보', icon: <UserCog size={20} /> },
  ];

  const renderNav = () => (
    <nav
      aria-label="주요 메뉴"
      className="hidden md:flex w-20 shrink-0 bg-neutral-900 text-white flex-col items-center py-5 gap-3 sticky top-0 h-screen print:hidden"
    >
      <div className="w-11 h-11 border-2 border-white flex items-center justify-center font-black text-lg mb-4" title="Link-路">路</div>
      {navItems.map((item) => {
        const active = nav === item.key;
        return (
          <button
            key={item.key}
            type="button"
            aria-current={active ? 'page' : undefined}
            onClick={() => setNav(item.key)}
            className={`w-16 py-3 flex flex-col items-center gap-1.5 transition-colors ${
              active ? 'bg-white text-neutral-900' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'
            }`}
          >
            {item.icon}
            <span className="text-[10px] font-bold leading-tight text-center">{item.label}</span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={onSignOut}
        className="mt-auto w-16 py-3 flex flex-col items-center gap-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
      >
        <LogOut size={20} />
        <span className="text-[10px] font-bold">로그아웃</span>
      </button>
    </nav>
  );

  const renderBottomNav = () => (
    <nav
      aria-label="주요 메뉴"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-neutral-900 text-white flex pb-[env(safe-area-inset-bottom)] print:hidden"
    >
      {navItems.map((item) => {
        const active = nav === item.key;
        return (
          <button
            key={item.key}
            type="button"
            aria-current={active ? 'page' : undefined}
            onClick={() => setNav(item.key)}
            className={`flex-1 flex flex-col items-center gap-1 pt-2.5 pb-1.5 transition-colors ${active ? 'text-white' : 'text-neutral-500'}`}
          >
            {item.icon}
            <span className="text-[10px] font-bold">{item.label}</span>
            <span className={`h-0.5 w-6 ${active ? 'bg-white' : 'bg-transparent'}`} />
          </button>
        );
      })}
    </nav>
  );

  const copyButton = (student: Student, kind: LinkKind, compact = false) => (
    <button
      type="button"
      onClick={() => copyLink(student, kind)}
      className={`flex items-center gap-2 border-2 border-neutral-900 text-sm font-bold hover:bg-neutral-900 hover:text-white transition-colors ${
        compact ? 'px-3 py-2' : 'px-3 py-1.5 sm:px-4 sm:py-2'
      }`}
    >
      {copiedKey === `${student.id}:${kind}` ? <Check size={15} /> : <Copy size={15} />}
      {copiedKey === `${student.id}:${kind}` ? '복사됨' : kind === 'ojt' ? '사장님 평가 링크' : '자기평가 링크'}
    </button>
  );

  const renderStudentItem = (s: Student) => {
    const active = s.id === selectedId;
    const last = s.evaluations[s.evaluations.length - 1];
    return (
      <li key={s.id}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => selectStudent(s.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') selectStudent(s.id);
          }}
          className={`flex items-center justify-between gap-3 py-4 pl-3 pr-2 cursor-pointer transition-colors ${
            active ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-100'
          }`}
        >
          <div className="min-w-0">
            <p className="font-bold truncate">
              {s.name} <span className={`text-xs font-normal ${active ? 'text-neutral-300' : 'text-neutral-500'}`}>{s.grade}</span>
              {unseen[s.id] ? (
                <span
                  className={`ml-2 px-1.5 py-0.5 text-[10px] font-bold align-middle ${
                    active ? 'bg-white text-neutral-900' : 'bg-neutral-900 text-white'
                  }`}
                >
                  새 평가 {unseen[s.id]}
                </span>
              ) : null}
            </p>
            <p className={`text-xs truncate ${active ? 'text-neutral-300' : 'text-neutral-500'}`}>
              {s.mainField}
              {s.site ? ` / ${s.site}` : ''}
            </p>
            <p className={`text-[11px] mt-1 ${active ? 'text-neutral-400' : 'text-neutral-400'}`}>
              평가 {s.evaluations.length}건{last ? ` · 최근 ${last.evaluated_at}` : ''}
            </p>
          </div>
          <button
            type="button"
            aria-label={`${s.name} 삭제`}
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteStudent(s);
            }}
            className={`p-1.5 shrink-0 ${active ? 'hover:bg-neutral-700' : 'hover:bg-neutral-200'}`}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </li>
    );
  };

  // ── 좌측 Master ──
  const renderSidebar = () => (
    <aside
      className={`md:border-r-2 border-neutral-900 p-4 md:p-6 lg:p-8 space-y-6 md:space-y-10 print:hidden ${
        mobilePane === 'detail' ? 'hidden md:block' : ''
      }`}
    >
      <button
        type="button"
        onClick={() => setShowAddForm((v) => !v)}
        aria-expanded={showAddForm}
        className="md:hidden w-full flex items-center justify-center gap-2 border-2 border-neutral-900 text-sm font-bold py-3"
      >
        {showAddForm ? <X size={16} /> : <UserPlus size={16} />}
        {showAddForm ? '학생 추가 닫기' : '학생 추가'}
      </button>
      <form onSubmit={handleAdd} className={`space-y-3 ${showAddForm ? 'block' : 'hidden'} md:block`}>
        <h2 className="text-sm font-bold pb-3 border-b-2 border-neutral-900">학생 추가</h2>
        <input className={inputClass} placeholder="학생 이름" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <select className={inputClass} value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} aria-label="학년">
          {GRADES.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <input
          className={inputClass}
          list="main-field-options"
          placeholder="희망 직무/실습 분야 (직접 입력)"
          value={form.mainField}
          onChange={(e) => setForm({ ...form, mainField: e.target.value })}
        />
        <datalist id="main-field-options">
          {fieldOptions.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
        <input className={inputClass} placeholder="실습처 (선택)" value={form.site} onChange={(e) => setForm({ ...form, site: e.target.value })} />
        {formError && <p className="text-xs font-semibold border-l-4 border-neutral-900 pl-2">{formError}</p>}
        <button
          type="submit"
          disabled={adding}
          className="w-full flex items-center justify-center gap-2 bg-neutral-900 text-white text-sm font-bold py-3 hover:bg-neutral-700 transition-colors disabled:opacity-60"
        >
          {adding ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
          {adding ? '추가하는 중...' : '학생 추가'}
        </button>
      </form>

      <div>
        <h2 className="text-sm font-bold pb-3 border-b-2 border-neutral-900 flex justify-between">
          <span>학생 목록</span>
          <span className="font-normal text-neutral-500">
            {studentQuery.trim() ? `${filteredStudents.length} / ${students.length}명` : `${students.length}명`}
          </span>
        </h2>
        {students.length > 0 && (
          <div className="space-y-2 pt-3 pb-1">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                className={`${inputClass} pl-9`}
                placeholder="이름 · 직무 · 실습처 검색"
                value={studentQuery}
                onChange={(e) => setStudentQuery(e.target.value)}
                aria-label="학생 검색"
              />
            </div>
            <div className="grid grid-cols-2 border-2 border-neutral-900 text-xs font-bold">
              {[
                { on: false, label: '전체 목록' },
                { on: true, label: '학년별 묶기' },
              ].map((opt, i) => (
                <button
                  key={opt.label}
                  type="button"
                  aria-pressed={groupByGrade === opt.on}
                  onClick={() => toggleGroupByGrade(opt.on)}
                  className={`py-1.5 transition-colors ${i > 0 ? 'border-l-2 border-neutral-900' : ''} ${
                    groupByGrade === opt.on ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {loading ? (
          <p className="text-sm text-neutral-500 py-6 flex items-center gap-2">
            <Loader2 size={16} className="animate-spin" /> 불러오는 중...
          </p>
        ) : students.length === 0 ? (
          <p className="text-sm text-neutral-500 py-6">등록된 학생이 없습니다. 위 양식에서 추가하세요.</p>
        ) : filteredStudents.length === 0 ? (
          <p className="text-sm text-neutral-500 py-6">'{studentQuery.trim()}'에 해당하는 학생이 없습니다.</p>
        ) : groupByGrade ? (
          <div>
            {gradeGroups.map((g) => {
              const collapsed = !studentQuery.trim() && collapsedGrades[g.grade];
              return (
                <div key={g.grade}>
                  <button
                    type="button"
                    onClick={() => setCollapsedGrades((prev) => ({ ...prev, [g.grade]: !prev[g.grade] }))}
                    aria-expanded={!collapsed}
                    className="w-full flex items-center justify-between py-2.5 mt-2 border-b-2 border-neutral-900 text-sm font-bold"
                  >
                    <span className="flex items-center gap-1.5">
                      {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                      {g.grade}
                    </span>
                    <span className="font-normal text-neutral-500 text-xs">{g.list.length}명</span>
                  </button>
                  {!collapsed && <ul className="divide-y divide-neutral-200">{g.list.map((st) => renderStudentItem(st))}</ul>}
                </div>
              );
            })}
          </div>
        ) : (
          <ul className="divide-y divide-neutral-200">{filteredStudents.map((st) => renderStudentItem(st))}</ul>
        )}
      </div>

      {trashed.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowTrash((v) => !v)}
            aria-expanded={showTrash}
            className="w-full flex items-center justify-between py-2.5 border-b-2 border-neutral-300 text-sm font-bold text-neutral-600 hover:text-neutral-900"
          >
            <span className="flex items-center gap-1.5">
              {showTrash ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              <Trash2 size={14} /> 휴지통
            </span>
            <span className="font-normal text-xs">{trashed.length}명</span>
          </button>
          {showTrash && (
            <>
              <p className="text-[11px] text-neutral-500 mt-2 leading-relaxed">
                휴지통의 학생은 {TRASH_DAYS}일 뒤 자동으로 완전히 삭제됩니다. 보관 중에는 사장님·학생 링크와 공유 링크가 열리지 않습니다.
              </p>
              <ul className="divide-y divide-neutral-200 mt-1">
                {trashed.map((st) => (
                  <li key={st.id} className="py-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-neutral-600 truncate">
                        {st.name} <span className="text-xs font-normal">{st.grade}</span>
                      </p>
                      <p className="text-[11px] text-neutral-400">
                        평가 {st.evaluations.length}건 · {st.deletedAt ? `${daysLeft(st.deletedAt)}일 후 완전 삭제` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => restoreStudent(st)}
                        className="flex items-center gap-1 border-2 border-neutral-900 px-2 py-1 text-xs font-bold hover:bg-neutral-900 hover:text-white transition-colors"
                      >
                        <RotateCcw size={12} /> 되살리기
                      </button>
                      <button
                        type="button"
                        onClick={() => purgeStudent(st)}
                        aria-label={`${st.name} 완전 삭제`}
                        title="완전 삭제"
                        className="p-1.5 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </aside>
  );

  // ── 탭 1: 새 평가 입력 ──
  const renderNewEvaluation = (s: Student) => {
    const rubric = FORMS[formFor(draft.kind, s.grade)];
    return (
      <div className="space-y-10 print:hidden">
        <section className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-6 items-end">
          <div>
            <p className="text-sm font-semibold mb-3">평가 종류</p>
            <div className="grid grid-cols-2 border-2 border-neutral-900">
              {(['teacher', 'ojt'] as StaffKind[]).map((k, i) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={draft.kind === k}
                  onClick={() => changeDraftKind(k)}
                  className={`py-3 text-sm font-bold transition-colors ${i > 0 ? 'border-l-2 border-neutral-900' : ''} ${
                    draft.kind === k ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-100'
                  }`}
                >
                  {k === 'teacher' ? '교사 평가' : '고용주 평가 대리 입력'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="eval-date" className="block text-sm font-semibold mb-3">
              평가일
            </label>
            <input
              id="eval-date"
              type="date"
              value={draft.date}
              onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              className={`${inputClass} py-2.5`}
            />
          </div>
        </section>

        {draft.kind === 'ojt' && (
          <section className="space-y-5">
            <div className="border-2 border-neutral-900 p-4 sm:p-5 space-y-3">
              <p className="text-sm leading-relaxed">
                고용주 평가는 <b>사장님이 링크로 직접 제출하는 것이 원칙</b>입니다. 링크를 쓰기 어려운 경우(전화로 구두 평가, 종이
                평가지, 현장 면담)에만 대리 입력하십시오. 대리 입력한 기록은 히스토리와 리포트에 "교사 대리 입력"으로 구분되어 표시됩니다.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-neutral-500">링크로 받으려면</span>
                {copyButton(s, 'ojt', true)}
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-6 items-end">
              <div>
                <p className="text-sm font-semibold mb-3">대리 입력 방식</p>
                <div className="grid grid-cols-3 border-2 border-neutral-900">
                  {PROXY_METHODS.map((m, i) => (
                    <button
                      key={m.value}
                      type="button"
                      aria-pressed={draft.method === m.value}
                      onClick={() => setDraft({ ...draft, method: m.value })}
                      className={`py-3 text-sm font-bold transition-colors ${i > 0 ? 'border-l-2 border-neutral-900' : ''} ${
                        draft.method === m.value ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-100'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="proxy-evaluator" className="block text-sm font-semibold mb-3">
                  평가한 사장님 성함
                </label>
                <input
                  id="proxy-evaluator"
                  value={draft.evaluator}
                  onChange={(e) => setDraft({ ...draft, evaluator: e.target.value })}
                  maxLength={50}
                  placeholder="예: 홍길동 점장"
                  className={inputClass}
                />
              </div>
            </div>
          </section>
        )}

        {draft.kind === 'teacher' && !TEACHER_TARGET_GRADES.includes(s.grade) && (
          <p className="text-sm border-l-4 border-neutral-900 pl-3 py-1">
            {s.name} 학생은 {s.grade}입니다. 교사 평가는 중학교와 고1~2 학생을 기준으로 설계되었습니다.
          </p>
        )}

        <p className="text-xs text-neutral-500 -mt-4">
          적용 양식: <b className="text-neutral-900">{rubric.label}</b>
          {draft.kind === 'ojt' ? ` · ${s.grade} → ${TRACK_LABEL[trackOf(s.grade)]}` : ''} · 관찰할 기회가 없었던 항목은 '관찰 기회 없음'을 선택하세요.
        </p>

        <section>
          <h3 className="text-sm font-bold mb-3">평가 척도</h3>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-0.5 bg-neutral-900 border-2 border-neutral-900">
            {rubric.scale.map((sc) => (
              <div key={sc.value} className="bg-white p-4">
                <p className="text-2xl font-black">{sc.value}점</p>
                <p className="text-sm font-bold mt-1">{sc.label}</p>
                <p className="text-xs text-neutral-500 mt-1 leading-relaxed">{sc.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {rubric.domains.map((domain, di) => {
          const ids = domain.items.map((i) => i.id);
          const na = ids.filter((id) => draft.scores[id] === NA).length;
          return (
            <section key={domain.key}>
              <div className="flex justify-between items-end gap-3 border-b-4 border-neutral-900 pb-2 mb-1">
                <h3 className="text-base sm:text-lg font-bold">
                  {di + 1}. {domain.title}
                </h3>
                <p className="text-sm tabular-nums whitespace-nowrap">
                  <span className="font-bold">{pct(rateOrNull(draft.scores, ids, rubric.max))}</span>
                  {na > 0 && <span className="text-neutral-500 text-xs"> · 관찰 없음 {na}</span>}
                </p>
              </div>
              <div className="divide-y divide-neutral-200">
                {domain.items.map((item) => (
                  <ItemScorer
                    key={item.id}
                    item={item}
                    scale={rubric.scale}
                    allowNA={rubric.allowNA}
                    value={draft.scores[item.id]}
                    onChange={(v) => setDraft({ ...draft, scores: { ...draft.scores, [item.id]: v } })}
                  />
                ))}
              </div>
            </section>
          );
        })}

        <section>
          <h3 className="text-lg font-bold border-b-4 border-neutral-900 pb-2 mb-5">{rubric.domains.length + 1}. 종합 평가</h3>
          <p className="text-sm font-semibold mb-3">{rubric.summaryTitle}</p>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 mb-6">
            {rubric.summaryOptions.map((opt) => {
              const active = draft.summary === opt.value;
              return (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 border-2 px-4 py-3 cursor-pointer text-sm font-semibold transition-colors ${
                    active ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 hover:border-neutral-900'
                  }`}
                >
                  <input
                    type="radio"
                    name={`summary-${draft.kind}`}
                    value={opt.value}
                    checked={active}
                    onChange={() => setDraft({ ...draft, summary: opt.value })}
                    className="accent-neutral-900 mt-1"
                  />
                  <span>
                    <span className="block">{opt.label}</span>
                    {opt.desc && (
                      <span className={`block text-xs font-normal mt-0.5 ${active ? 'text-neutral-300' : 'text-neutral-500'}`}>{opt.desc}</span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
          <label className="block text-sm font-semibold mb-3" htmlFor="draft-comment">
            {rubric.commentTitle}
          </label>
          <textarea
            id="draft-comment"
            value={draft.comment}
            onChange={(e) => setDraft({ ...draft, comment: e.target.value })}
            placeholder={rubric.commentPlaceholder}
            className="w-full h-40 border-2 border-neutral-300 p-4 text-base md:text-sm leading-relaxed focus:outline-none focus:border-neutral-900"
          />
        </section>

        <div className="border-t-4 border-neutral-900 pt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <p className="text-sm text-neutral-600">
            저장하면 {s.name} 학생의 평가 히스토리에 새 기록으로 추가됩니다. 이전 기록은 그대로 남습니다.
          </p>
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={saving}
            className="w-full sm:w-auto shrink-0 flex items-center justify-center gap-2 bg-neutral-900 text-white text-sm font-bold px-8 py-3 hover:bg-neutral-700 transition-colors disabled:opacity-60"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <ClipboardCheck size={16} />}
            {saving ? '저장하는 중...' : '평가 저장'}
          </button>
        </div>
        {draftError && <p className="text-sm font-semibold border-l-4 border-neutral-900 pl-3">{draftError}</p>}
      </div>
    );
  };

  // ── 탭 2: 평가 히스토리 ──
  const renderHistory = (s: Student) => {
    if (s.evaluations.length === 0) {
      return (
        <div className="border-2 border-neutral-900 p-10 text-center print:hidden">
          <p className="text-sm text-neutral-600">아직 평가 기록이 없습니다. 새 평가 입력 탭에서 첫 평가를 저장하세요.</p>
        </div>
      );
    }
    const dates = Array.from(new Set(s.evaluations.map((e) => e.evaluated_at))).sort();
    const trend = dates.map((date) => {
      const point: Record<string, string | number | null> = { date };
      KINDS.forEach((k) => {
        const rows = s.evaluations.filter((e) => e.kind === k && e.evaluated_at === date);
        point[k] = rows.length ? overallRate(rows[rows.length - 1]) : null;
      });
      return point;
    });
    const newestFirst = [...s.evaluations].reverse();

    return (
      <div className="space-y-10 print:hidden">
        {notice && <p className="text-sm font-semibold border-l-4 border-neutral-900 pl-3 py-1">{notice}</p>}

        <section>
          <div className="flex flex-wrap justify-between items-end gap-3 border-b-4 border-neutral-900 pb-2 mb-4">
            <h3 className="text-lg font-bold">종합 달성률 변화</h3>
            <SeriesLegend />
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 10, right: 16, bottom: 0, left: -16 }}>
                <CartesianGrid stroke="#e5e5e5" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#525252' }} axisLine={{ stroke: '#171717' }} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#525252' }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip />
                {KINDS.map((k) => (
                  <Line
                    key={k}
                    type="linear"
                    dataKey={k}
                    name={KIND_SHORT[k]}
                    stroke={SERIES_STYLE[k].stroke}
                    strokeWidth={k === 'self' ? 2 : SERIES_STYLE[k].strokeWidth}
                    strokeDasharray={SERIES_STYLE[k].dash}
                    dot={{ r: 3, fill: SERIES_STYLE[k].stroke }}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section>
          <h3 className="text-lg font-bold border-b-4 border-neutral-900 pb-2 mb-1">평가 기록 ({s.evaluations.length}건)</h3>
          <div className="lg:overflow-x-auto">
            <table className="w-full text-sm block lg:table">
              <thead className="hidden lg:table-header-group">
                <tr className="border-b-2 border-neutral-900 text-left">
                  <th className="py-3 pr-4 font-bold">평가일</th>
                  <th className="py-3 pr-4 font-bold">구분</th>
                  <th className="py-3 pr-4 font-bold text-right">종합</th>
                  <th className="py-3 pr-4 font-bold">영역별 달성률</th>
                  <th className="py-3 pr-4 font-bold">종합 판정</th>
                  <th className="py-3 w-10" />
                </tr>
              </thead>
              <tbody className="block lg:table-row-group divide-y divide-neutral-200">
                {newestFirst.map((row) => {
                  const rubric = rubricOf(row);
                  return (
                    <tr key={row.id} className="relative block lg:table-row align-top py-4 lg:py-0">
                      <td className="inline lg:table-cell lg:py-4 pr-2 lg:pr-4 tabular-nums whitespace-nowrap text-xs lg:text-sm text-neutral-500 lg:text-neutral-900">{row.evaluated_at}</td>
                      <td className="inline lg:table-cell lg:py-4 pr-2 lg:pr-4 whitespace-nowrap font-semibold text-xs lg:text-sm">{KIND_LABEL[row.kind]}</td>
                      <td className="block lg:table-cell lg:py-4 lg:pr-4 lg:text-right font-black tabular-nums text-2xl lg:text-sm mt-1 lg:mt-0">{overallRate(row)}%</td>
                      <td className="block lg:table-cell lg:py-4 lg:pr-4 mt-2 lg:mt-0">
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600">
                          {rubric.domains.map((d) => (
                            <span key={d.key} className="whitespace-nowrap">
                              {d.title.replace(/\s*\(.*\)/, '')} <b className="text-neutral-900 tabular-nums">{pct(domainRate(row, d))}</b>
                            </span>
                          ))}
                        </div>
                        <p className="text-[11px] text-neutral-400 mt-1">
                          {rubric.label}
                          {naCount(row) > 0 ? ` · 관찰 기회 없음 ${naCount(row)}개` : ''}
                        </p>
                        {(sourceLabel(row) || row.evaluator) && (
                          <p className="text-xs text-neutral-500 mt-2">
                            {[sourceLabel(row), row.evaluator ? `평가자 ${row.evaluator}` : ''].filter(Boolean).join(' · ')}
                          </p>
                        )}
                        {row.comment && <p className="text-xs text-neutral-500 mt-2 line-clamp-2 whitespace-pre-line">{row.comment}</p>}
                      </td>
                      <td className="block lg:table-cell lg:py-4 lg:pr-4 whitespace-nowrap text-xs lg:text-sm font-semibold lg:font-normal mt-2 lg:mt-0">{row.kind === 'self' ? '-' : optionLabel(row)}</td>
                      <td className="absolute top-3 right-0 lg:static lg:table-cell lg:py-4">
                        <button
                          type="button"
                          aria-label="이 평가 삭제"
                          onClick={() => handleDeleteEvaluation(row)}
                          className="p-1.5 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  };

  // ── 탭 4: 사장님용 자료 (학생소개서 · 1-Page 포트폴리오) ──
  const buildShareData = (s: Student, intro: Intro): ShareData => ({
    name: s.name,
    grade: s.grade,
    mainField: s.mainField,
    site: s.site,
    intro,
    teacher: { name: profile.name, school: profile.school, contact: profile.contact ?? '' },
    ojt: latestOf(s.evaluations, 'ojt'),
    training: latestOf(s.evaluations, 'teacher'),
  });

  const doPrint = (target: PrintTarget) => {
    setPrintTarget(target);
    window.setTimeout(() => {
      window.print();
      setPrintTarget('insight');
    }, 150);
  };

  const updateIntro = (patch: Partial<Intro>) => {
    setIntroDraft((prev) => ({ ...prev, ...patch }));
    setIntroDirty(true);
    setIntroMsg(null);
  };

  const saveIntro = async (s: Student) => {
    const clean: Intro = {
      headline: introDraft.headline.trim(),
      keywords: introDraft.keywords.map((k) => k.trim().replace(/^#/, '')),
      strength: introDraft.strength.trim(),
      tip: introDraft.tip.trim(),
      support: introDraft.support.trim(),
      notes: Object.fromEntries(Object.entries(introDraft.notes).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v)),
    };
    setIntroSaving(true);
    const { error } = await supabase.from(STUDENTS_TABLE).update({ intro: clean }).eq('id', s.id);
    setIntroSaving(false);
    if (error) {
      setIntroMsg({ type: 'error', text: `저장하지 못했습니다: ${error.message}` });
      return;
    }
    setStudents((prev) => prev.map((st) => (st.id === s.id ? { ...st, intro: clean } : st)));
    setIntroDraft(clean);
    setIntroDirty(false);
    setIntroMsg({ type: 'ok', text: '저장되었습니다. 공유 링크에도 바로 반영됩니다.' });
  };

  const setShare = async (s: Student, on: boolean) => {
    if (!on && !window.confirm('공유를 중지하면 이미 보낸 링크가 더 이상 열리지 않습니다. 중지할까요?')) return;
    setShareBusy(true);
    const token = on ? crypto.randomUUID() : null;
    const { error } = await supabase.from(STUDENTS_TABLE).update({ share_token: token }).eq('id', s.id);
    setShareBusy(false);
    if (error) {
      window.alert(`처리하지 못했습니다: ${error.message}`);
      return;
    }
    setStudents((prev) => prev.map((st) => (st.id === s.id ? { ...st, shareToken: token } : st)));
  };

  const copyIntroLink = async (s: Student) => {
    if (!s.shareToken) return;
    const url = introLink(s.shareToken);
    const key = `${s.id}:intro`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000);
    } catch {
      window.prompt('아래 링크를 복사해 보내 주세요.', url);
    }
  };

  const renderEmployer = (s: Student) => {
    const preview = buildShareData(s, introDraft);
    const source = preview.ojt ?? preview.training;
    const noteDomains = source ? rubricOf(source).domains : [];
    const lastOjt = latestOf(s.evaluations, 'ojt');
    const lastSelf = latestOf(s.evaluations, 'self');
    const filename = `${s.name}_${docView === 'card' ? '학생소개서' : '포트폴리오'}.png`;

    return (
      <div className="space-y-10 print:hidden">
        <section className="border-2 border-neutral-900 p-4 sm:p-5">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold">학생소개서 공유 링크</h3>
              <p className="text-xs text-neutral-600 mt-1 leading-relaxed">
                링크를 받은 사장님은 로그인 없이 학생소개서와 1-Page 포트폴리오를 보고, 인쇄하거나 이미지로 저장할 수 있습니다. 평가
                의견과 히스토리는 공개되지 않습니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              {s.shareToken ? (
                <>
                  <button type="button" onClick={() => copyIntroLink(s)} className={toolButtonClass}>
                    {copiedKey === `${s.id}:intro` ? <Check size={15} /> : <Copy size={15} />}
                    {copiedKey === `${s.id}:intro` ? '복사됨' : '링크 복사'}
                  </button>
                  <a href={introLink(s.shareToken)} target="_blank" rel="noreferrer" className={toolButtonClass}>
                    <ExternalLink size={15} /> 열기
                  </a>
                  <button
                    type="button"
                    disabled={shareBusy}
                    onClick={() => setShare(s, false)}
                    className="text-xs text-neutral-500 underline px-2 hover:text-neutral-900"
                  >
                    공유 중지
                  </button>
                </>
              ) : (
                <button type="button" disabled={shareBusy} onClick={() => setShare(s, true)} className={toolButtonClass}>
                  {shareBusy ? <Loader2 size={15} className="animate-spin" /> : <Share2 size={15} />} 공유 링크 만들기
                </button>
              )}
            </div>
          </div>
        </section>

        {!profile.contact && (
          <p className="text-xs border-l-4 border-neutral-400 pl-3 py-0.5 text-neutral-600">
            [내 정보]에서 연락처를 입력하면 자료 하단에 "돌발 상황 연락처"로 표시됩니다.
          </p>
        )}

        <section>
          <h3 className="text-base sm:text-lg font-bold border-b-4 border-neutral-900 pb-2 mb-5">사장님을 위한 학생소개서 작성</h3>
          {(lastOjt?.comment || lastSelf?.comment) && (
            <div className="border-2 border-neutral-200 bg-neutral-50 p-4 mb-6 text-xs leading-relaxed space-y-2">
              <p className="font-bold">작성 참고</p>
              {lastOjt?.comment && (
                <p className="whitespace-pre-line">
                  <span className="text-neutral-500">최근 사장님 의견 ({lastOjt.evaluated_at}) · </span>
                  {lastOjt.comment}
                </p>
              )}
              {lastSelf?.comment && (
                <p className="whitespace-pre-line">
                  <span className="text-neutral-500">최근 학생 자기평가 ({lastSelf.evaluated_at}) · </span>
                  {lastSelf.comment}
                </p>
              )}
            </div>
          )}
          <div className="space-y-5">
            <div>
              <label htmlFor="intro-headline" className="block text-sm font-semibold mb-2">
                한 줄 소개
              </label>
              <input
                id="intro-headline"
                className={inputClass}
                value={introDraft.headline}
                maxLength={40}
                onChange={(e) => updateIntro({ headline: e.target.value })}
                placeholder={`예: 성실한 예비 직원 ${s.name}입니다`}
              />
            </div>
            <div>
              <p className="text-sm font-semibold mb-2">키워드 (최대 3개)</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[0, 1, 2].map((i) => (
                  <input
                    key={i}
                    className={inputClass}
                    value={introDraft.keywords[i] ?? ''}
                    maxLength={20}
                    onChange={(e) => {
                      const next = [...introDraft.keywords];
                      next[i] = e.target.value;
                      updateIntro({ keywords: next });
                    }}
                    placeholder={['예: 끝까지 해내는 끈기', '예: 밝은 인사', '예: 출퇴근 시간 엄수'][i]}
                  />
                ))}
              </div>
            </div>
            {INTRO_SECTIONS.map((sec) => (
              <div key={sec.key}>
                <label htmlFor={`intro-${sec.key}`} className="block text-sm font-semibold mb-1">
                  {sec.title} <span className="font-normal text-neutral-500 text-xs">· {sec.hint}</span>
                </label>
                <textarea
                  id={`intro-${sec.key}`}
                  value={introDraft[sec.key]}
                  maxLength={300}
                  onChange={(e) => updateIntro({ [sec.key]: e.target.value } as Partial<Intro>)}
                  placeholder={sec.placeholder}
                  className="w-full h-24 border-2 border-neutral-300 p-3 text-base md:text-sm leading-relaxed focus:outline-none focus:border-neutral-900"
                />
              </div>
            ))}
            {noteDomains.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-1">
                  영역별 근거 메모 <span className="font-normal text-neutral-500 text-xs">· 포트폴리오의 수준 라벨 옆에 표시됩니다 (선택)</span>
                </p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 mt-2">
                  {noteDomains.map((d) => (
                    <label key={d.key} className="block">
                      <span className="block text-xs text-neutral-600 mb-1">{d.title}</span>
                      <input
                        className={inputClass}
                        value={introDraft.notes[d.key] ?? ''}
                        maxLength={60}
                        onChange={(e) => updateIntro({ notes: { ...introDraft.notes, [d.key]: e.target.value } })}
                        placeholder="예: 지각 0회, 먼저 인사함"
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}
            {msgLine(introMsg)}
            <button
              type="button"
              onClick={() => saveIntro(s)}
              disabled={introSaving}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-neutral-900 text-white text-sm font-bold px-8 py-3 hover:bg-neutral-700 transition-colors disabled:opacity-60"
            >
              {introSaving && <Loader2 size={15} className="animate-spin" />} 학생소개서 저장
            </button>
          </div>
        </section>

        <section>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-4 border-neutral-900 pb-2 mb-4">
            <h3 className="text-base sm:text-lg font-bold">미리보기</h3>
            <DocViewToggle value={docView} onChange={setDocView} />
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            <button type="button" onClick={() => doPrint(docView)} className={toolButtonClass}>
              <Printer size={15} /> 인쇄
            </button>
            <button
              type="button"
              disabled={exporter.busy}
              onClick={() => exporter.run(docView === 'card' ? cardRef.current : docRef.current, filename)}
              className={toolButtonClass}
            >
              {exporter.busy ? <Loader2 size={15} className="animate-spin" /> : <ImageDown size={15} />} 이미지로 저장·공유
            </button>
          </div>
          {introDirty && (
            <p className="text-xs font-semibold border-l-4 border-neutral-900 pl-2 py-0.5 mb-4">
              저장하지 않은 내용이 있습니다. 미리보기에는 보이지만, 공유 링크에는 저장한 내용만 보입니다.
            </p>
          )}
          {docView === 'card' ? (
            <StudentIntroCard data={preview} />
          ) : (
            <div className="max-w-[210mm]">
              <EmployerPortfolioDoc data={preview} />
            </div>
          )}
        </section>

        <ExportFrame width={468} nodeRef={cardRef}>
          <StudentIntroCard data={preview} fixed />
        </ExportFrame>
        <ExportFrame width={842} nodeRef={docRef}>
          <EmployerPortfolioDoc data={preview} fixed />
        </ExportFrame>
      </div>
    );
  };

  // ── 탭 3: 통합 인사이트 (1-Page) ──
  const renderInsight = (s: Student) => {
    const latest: Record<Kind, EvaluationRow | null> = {
      ojt: latestOf(s.evaluations, 'ojt'),
      teacher: latestOf(s.evaluations, 'teacher'),
      self: latestOf(s.evaluations, 'self'),
    };
    const present = KINDS.filter((k) => latest[k]);
    const radarData = INTEGRATED_AXES.map((axis) => {
      const point: Record<string, string | number> = { axis: axis.label };
      KINDS.forEach((k) => {
        const row = latest[k];
        point[k] = row ? axisRate(row, axis) ?? 0 : 0;
      });
      return point;
    });

    const showPerformance =
      (latest.ojt !== null && formOf(latest.ojt) === 'ojt_senior') || (latest.self !== null && formOf(latest.self) === 'self_senior');
    const gapRows = [...INTEGRATED_AXES, ...(showPerformance ? [PERFORMANCE_AXIS] : [])].map((axis) => {
      const v: Record<Kind, number | null> = {
        ojt: latest.ojt ? axisRate(latest.ojt, axis) : null,
        teacher: latest.teacher ? axisRate(latest.teacher, axis) : null,
        self: latest.self ? axisRate(latest.self, axis) : null,
      };
      const staff = [v.ojt, v.teacher].filter((x): x is number => x !== null);
      const notes: string[] = [];
      if (v.self !== null && staff.length) {
        const diff = v.self - staff.reduce((a, b) => a + b, 0) / staff.length;
        if (diff >= 20) notes.push('학생 자기 인식이 더 높음');
        else if (diff <= -20) notes.push('학생 자기 인식이 더 낮음');
        else notes.push('3자 인식 일치');
      }
      if (v.ojt !== null && v.teacher !== null && Math.abs(v.ojt - v.teacher) >= 20) notes.push('현장·교내 차이 큼');
      if (axis.key === 'performance') notes.push('취업 실습 양식 전용 · 차트 제외');
      return { axis, v, note: notes.join(' / ') || '-' };
    });

    const performance = latest.ojt && formOf(latest.ojt) === 'ojt_senior' ? domainRate(latest.ojt, FORMS.ojt_senior.domains[3]) : null;
    const cell = (n: number | null) => (n === null ? '-' : `${n}%`);

    return (
      <article className="max-w-[210mm] mx-auto bg-white border-2 border-neutral-900 p-4 sm:p-6 lg:p-10 print:max-w-none print:border-0 print:p-0 text-neutral-900">
        <header className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3 border-b-4 border-neutral-900 pb-4">
          <div>
            <p className="text-xs text-neutral-500">3자 통합 직무 역량 인사이트 (고용주 · 교사 · 학생)</p>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight mt-1">{s.name}</h1>
          </div>
          <dl className="text-xs sm:text-right space-y-0.5">
            {(
              [
                ['학년', s.grade],
                ['희망 직무', s.mainField],
                ['실습처', s.site || '-'],
                ['작성일', today()],
              ] as [string, string][]
            ).map(([k, v]) => (
              <div key={k}>
                <dt className="inline text-neutral-500">{k} </dt>
                <dd className="inline font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        </header>

        <section className="grid grid-cols-1 lg:grid-cols-3 print:grid-cols-3 border-b-2 border-neutral-900">
          {KINDS.map((k, i) => {
            const row = latest[k];
            return (
              <div key={k} className={`py-3 lg:py-4 print:py-4 ${
                  i === 0
                    ? 'lg:pr-4 print:pr-4'
                    : 'border-t border-neutral-200 lg:border-t-0 print:border-t-0 lg:px-4 print:px-4 lg:border-l-2 print:border-l-2 lg:border-neutral-900 print:border-neutral-900'
                }`}>
                <p className="text-xs text-neutral-500">
                  최신 {KIND_LABEL[k]} {row ? `· ${row.evaluated_at}` : ''}
                </p>
                {row ? (
                  <>
                    <p className="text-3xl font-black tabular-nums mt-1">{overallRate(row)}%</p>
                    <p className="text-xs font-semibold mt-1">
                      {k === 'self' ? `${rubricOf(row).max}점 척도 자기평가` : optionLabel(row)}
                      {k === 'ojt' && performance !== null ? ` · 직무 성과 ${performance}%` : ''}
                    </p>
                    {k === 'ojt' && sourceLabel(row) && <p className="text-[11px] text-neutral-500 mt-0.5">{sourceLabel(row)}</p>}
                  </>
                ) : (
                  <p className="text-sm text-neutral-400 mt-3">평가 기록 없음</p>
                )}
              </div>
            );
          })}
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-[280px_1fr] print:grid-cols-[280px_1fr] gap-6 py-5 border-b-2 border-neutral-900 break-inside-avoid">
          <div className="flex flex-col items-center overflow-hidden">
            {present.length === 0 ? (
              <div className="w-[280px] h-[240px] flex items-center justify-center text-xs text-neutral-400">평가 기록이 없습니다.</div>
            ) : (
              <RadarChart width={280} height={240} data={radarData} outerRadius={80}>
                <PolarGrid stroke="#d4d4d4" />
                <PolarAngleAxis dataKey="axis" tick={{ fill: '#171717', fontSize: 10, fontWeight: 600 }} />
                <PolarRadiusAxis domain={[0, 100]} tickCount={5} tick={{ fill: '#a3a3a3', fontSize: 8 }} axisLine={false} />
                {/* 아래에서 위 순서: 학생(채움) → 교사(점선) → 고용주(굵은 실선) */}
                {(['self', 'teacher', 'ojt'] as Kind[])
                  .filter((k) => latest[k])
                  .map((k) => (
                    <Radar
                      key={k}
                      dataKey={k}
                      name={KIND_SHORT[k]}
                      stroke={SERIES_STYLE[k].stroke}
                      strokeWidth={SERIES_STYLE[k].strokeWidth}
                      strokeDasharray={SERIES_STYLE[k].dash}
                      fill={SERIES_STYLE[k].fill}
                      fillOpacity={SERIES_STYLE[k].fillOpacity}
                      isAnimationActive={false}
                    />
                  ))}
              </RadarChart>
            )}
            <SeriesLegend />
          </div>

          <div>
            <h2 className="text-sm font-bold mb-2">영역별 3자 비교 (달성률)</h2>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b-2 border-neutral-900">
                  <th className="text-left font-bold py-1.5">공통 영역</th>
                  <th className="text-right font-bold py-1.5 w-12">고용주</th>
                  <th className="text-right font-bold py-1.5 w-12">교사</th>
                  <th className="text-right font-bold py-1.5 w-12">학생</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {gapRows.map(({ axis, v, note }) => (
                  <tr key={axis.key}>
                    <td className="py-2">
                      <span className="font-semibold">{axis.label}</span>
                      <span className="block text-[10px] text-neutral-500 mt-0.5">{note}</span>
                    </td>
                    <td className="py-2 text-right font-bold tabular-nums">{cell(v.ojt)}</td>
                    <td className="py-2 text-right tabular-nums">{cell(v.teacher)}</td>
                    <td className="py-2 text-right tabular-nums text-neutral-600">{cell(v.self)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[10px] text-neutral-500 mt-3 leading-relaxed">
              세 평가는 척도(4점·4점·3점)와 항목이 달라 의미가 같은 항목끼리 묶어 달성률로 환산했으며, '관찰 기회 없음' 항목은
              계산에서 제외했습니다. 직무 성과·유연성은 취업 실습 양식(고3·전공과)에만 있어 차트에서 빼고 비교표에만 표시합니다. 학생
              값이 다른 평가 평균보다 20%p 이상 차이 나면 인식 차이로 표시합니다.
            </p>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 print:grid-cols-3 gap-5 py-5 border-b-2 border-neutral-900 break-inside-avoid">
          {(
            [
              ['ojt', '고용주 의견'],
              ['teacher', '교사 지도 목표 및 중재 계획'],
              ['self', '학생이 남긴 말'],
            ] as [Kind, string][]
          ).map(([k, title]) => (
            <div key={k}>
              <h2 className="text-xs font-bold mb-2">{title}</h2>
              <p className="text-[11px] leading-relaxed whitespace-pre-line border-l-4 border-neutral-900 pl-3 min-h-12">
                {latest[k]?.comment || '작성된 내용이 없습니다.'}
              </p>
            </div>
          ))}
        </section>

        <footer className="grid grid-cols-3 gap-3 sm:gap-8 pt-8 text-xs">
          {['학생', '담당 교사', '실습처 담당자'].map((who) => (
            <div key={who} className="flex justify-between border-t-2 border-neutral-900 pt-2">
              <span className="font-semibold">{who}</span>
              <span className="text-neutral-400">(서명)</span>
            </div>
          ))}
        </footer>
      </article>
    );
  };

  // ── 우측 Detail ──
  const renderDetail = () => {
    if (loadError) {
      return (
        <div className="border-2 border-neutral-900 p-6 text-sm flex justify-between items-center gap-4 print:hidden">
          <span className="font-semibold">{loadError}</span>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              fetchStudents();
            }}
            className="underline shrink-0"
          >
            다시 불러오기
          </button>
        </div>
      );
    }
    if (loading) {
      return (
        <div className="flex items-center justify-center py-32 text-sm text-neutral-500 gap-2 print:hidden">
          <Loader2 size={16} className="animate-spin" /> 불러오는 중...
        </div>
      );
    }
    if (!selected) {
      return (
        <div className="flex items-center justify-center py-32 print:hidden">
          <p className="text-sm text-neutral-500">왼쪽에서 학생을 추가하거나 선택하면 평가를 시작할 수 있습니다.</p>
        </div>
      );
    }
    const tabs: { key: Tab; label: string; icon: ReactNode }[] = [
      { key: 'new', label: '새 평가 입력', icon: <ClipboardCheck size={16} /> },
      { key: 'history', label: '평가 히스토리', icon: <History size={16} /> },
      { key: 'insight', label: '통합 인사이트', icon: <FileText size={16} /> },
      { key: 'employer', label: '사장님용 자료', icon: <Briefcase size={16} /> },
    ];
    return (
      <>
        <div className="md:hidden flex items-center justify-between gap-3 mb-3 print:hidden">
          <button type="button" onClick={() => setMobilePane('list')} className="flex items-center gap-1 text-sm font-bold py-2 pr-3 -ml-1">
            <ChevronLeft size={18} /> 학생 목록
          </button>
          <p className="text-sm text-right min-w-0 truncate">
            <span className="font-bold">{selected.name}</span>
            <span className="text-neutral-500"> · {selected.grade}</span>
          </p>
        </div>
        <div className="flex flex-col-reverse lg:flex-row lg:justify-between lg:items-end gap-2 lg:gap-3 border-b-2 border-neutral-900 mb-6 md:mb-8 print:hidden">
          <div className="flex overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-3 sm:px-5 py-3 text-sm font-bold border-b-4 -mb-0.5 whitespace-nowrap shrink-0 transition-colors ${
                  tab === t.key ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-400 hover:text-neutral-900'
                }`}
              >
                {t.icon} {t.label}
                {t.key === 'insight' && <span className="hidden sm:inline">(1-Page)</span>}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:gap-3 lg:pb-3">
            <p className="hidden md:block text-sm">
              <span className="font-bold">{selected.name}</span>
              <span className="text-neutral-500">
                {' '}
                · {selected.grade} · {selected.mainField}
              </span>
            </p>
            {copyButton(selected, 'ojt')}
            {copyButton(selected, 'self')}
            {tab === 'insight' && (
              <button
                type="button"
                onClick={() => doPrint('insight')}
                className="flex items-center gap-2 border-2 border-neutral-900 px-3 py-1.5 sm:px-4 sm:py-2 text-sm font-bold hover:bg-neutral-900 hover:text-white transition-colors"
              >
                <Printer size={16} /> 인쇄
              </button>
            )}
          </div>
        </div>

        {tab === 'new' && renderNewEvaluation(selected)}
        {tab === 'history' && renderHistory(selected)}
        {/* 인사이트: 화면에서는 해당 탭일 때만, 인쇄 시에는 어느 탭에서든 이것만 출력 */}
        {tab === 'employer' && renderEmployer(selected)}
        <div className={`${tab === 'insight' ? 'block' : 'hidden'} ${printTarget === 'insight' ? 'print:block' : 'print:hidden'}`}>
          {renderInsight(selected)}
        </div>
        {printTarget === 'portfolio' && (
          <div className="hidden print:block">
            <EmployerPortfolioDoc data={buildShareData(selected, introDraft)} fixed />
          </div>
        )}
        {printTarget === 'card' && (
          <div className="hidden print:block">
            <StudentIntroCard data={buildShareData(selected, introDraft)} fixed />
          </div>
        )}
      </>
    );
  };

  // ── 평가 링크 공유 화면 ──
  const renderShare = () => (
    <main className="p-4 md:p-8 print:hidden">
      <div className="max-w-5xl">
        <h2 className="text-lg font-bold border-b-4 border-neutral-900 pb-2">평가 링크 공유</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-5 text-sm text-neutral-600 leading-relaxed">
          <p className="border-l-4 border-neutral-900 pl-3">
            <b className="text-neutral-900">사장님 평가 링크</b>를 문자나 카카오톡으로 보내면, 사장님은 가입이나 로그인 없이
            구글폼처럼 바로 그 학생의 OJT 평가를 제출할 수 있습니다.
          </p>
          <p className="border-l-4 border-neutral-400 pl-3">
            <b className="text-neutral-900">자기평가 링크</b>는 학생용입니다. 두 링크 모두 제출할 때마다 새 기록으로 쌓이고, 해당
            학생의 평가 제출 외에는 아무것도 볼 수 없습니다.
          </p>
        </div>
        {loading ? (
          <p className="text-sm text-neutral-500 py-8 flex items-center gap-2">
            <Loader2 size={16} className="animate-spin" /> 불러오는 중...
          </p>
        ) : students.length === 0 ? (
          <p className="text-sm text-neutral-500 py-8">등록된 학생이 없습니다. 학생 대시보드에서 먼저 학생을 추가하세요.</p>
        ) : (
          <div className="overflow-x-auto mt-6">
            <div className="relative max-w-sm mb-4">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                className={`${inputClass} pl-9`}
                placeholder="이름 · 직무 · 실습처 검색"
                value={studentQuery}
                onChange={(e) => setStudentQuery(e.target.value)}
                aria-label="학생 검색"
              />
            </div>
            {filteredStudents.length === 0 && (
              <p className="text-sm text-neutral-500 py-4">'{studentQuery.trim()}'에 해당하는 학생이 없습니다.</p>
            )}
            <table className="w-full text-sm block md:table">
              <thead className="hidden md:table-header-group">
                <tr className="border-b-2 border-neutral-900 text-left">
                  <th className="py-3 pr-4 font-bold">학생</th>
                  <th className="py-3 pr-4 font-bold">사장님 평가 링크</th>
                  <th className="py-3 pr-4 font-bold">학생 자기평가 링크</th>
                  <th className="py-3 font-bold w-24" />
                </tr>
              </thead>
              <tbody className="block md:table-row-group divide-y divide-neutral-200">
                {filteredStudents.map((s) => {
                  const lastOjt = latestOf(s.evaluations, 'ojt');
                  const lastSelf = latestOf(s.evaluations, 'self');
                  const linkCell = (kind: LinkKind, last: EvaluationRow | null) => (
                    <td className="block md:table-cell py-2 md:py-4 md:pr-4">
                      <p className="md:hidden text-xs font-bold mb-1.5">{kind === 'ojt' ? '사장님 평가 링크' : '학생 자기평가 링크'}</p>
                      <div className="flex items-center gap-3">
                        {copyButton(s, kind, true)}
                        <a
                          href={linkFor(kind, kind === 'ojt' ? s.employerToken : s.selfToken)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm underline text-neutral-600 hover:text-neutral-900"
                        >
                          열기
                        </a>
                      </div>
                      <p className="text-[11px] text-neutral-500 mt-1.5 tabular-nums">
                        {last ? `최근 제출 ${last.evaluated_at} · ${overallRate(last)}%` : '제출 기록 없음'}
                      </p>
                    </td>
                  );
                  return (
                    <tr key={s.id} className="block md:table-row align-top py-3 md:py-0">
                      <td className="block md:table-cell pb-1 md:py-4 md:pr-4">
                        <span className="font-bold">{s.name}</span>
                        <span className="text-neutral-500"> · {s.grade}</span>
                        <span className="block text-xs text-neutral-500 mt-0.5">
                          {s.mainField}
                          {s.site ? ` / ${s.site}` : ''}
                        </span>
                      </td>
                      {linkCell('ojt', lastOjt)}
                      {linkCell('self', lastSelf)}
                      <td className="block md:table-cell py-2 md:py-4">
                        <button
                          type="button"
                          onClick={() => regenerateLinks(s)}
                          disabled={regenId === s.id}
                          className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-900 disabled:opacity-50"
                          title="링크가 외부에 잘못 전달되었을 때 기존 링크를 무효화합니다."
                        >
                          <RefreshCw size={13} className={regenId === s.id ? 'animate-spin' : ''} /> 재발급
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );

  // ── 회원 승인 화면 (관리자 전용: 학생 데이터는 보이지 않음) ──
  const ROLE_LABEL: Record<Role, string> = { pending: '승인 대기', teacher: '교사', admin: '관리자' };
  const pendingCount = members.filter((m) => m.role === 'pending' && m.email_confirmed_at).length;
  const unconfirmedCount = members.filter((m) => m.role === 'pending' && !m.email_confirmed_at).length;

  const renderMembers = () => (
    <main className="p-4 md:p-8 print:hidden">
      <div className="max-w-5xl">
        <h2 className="text-lg font-bold border-b-4 border-neutral-900 pb-2 flex justify-between items-end">
          <span>회원 승인</span>
          <span className="text-sm font-normal text-neutral-500">
            승인 대기 {pendingCount}명{unconfirmedCount > 0 ? ` · 메일 미인증 ${unconfirmedCount}명` : ''}
          </span>
        </h2>
        <p className="text-sm text-neutral-600 mt-4 leading-relaxed">
          가입 신청한 모든 회원이 표시됩니다. 메일 인증을 마친 회원만 승인할 수 있으며, 연구회 선생님이 맞는지 확인한 뒤
          승인하세요. 메일 미인증 계정은 이메일을 잘못 입력했을 수 있으니, 본인에게 확인한 뒤 삭제하고 다시 가입하도록 안내해 주세요.
          이 화면에서는 각 선생님의 학생 정보가 보이지 않습니다.
        </p>
        {membersError && <p className="text-sm font-semibold border-l-4 border-neutral-900 pl-3 mt-4">{membersError}</p>}
        {membersLoading ? (
          <p className="text-sm text-neutral-500 py-8 flex items-center gap-2">
            <Loader2 size={16} className="animate-spin" /> 불러오는 중...
          </p>
        ) : (
          <div className="overflow-x-auto mt-6">
            <table className="w-full text-sm block md:table">
              <thead className="hidden md:table-header-group">
                <tr className="border-b-2 border-neutral-900 text-left">
                  <th className="py-3 pr-4 font-bold">이름</th>
                  <th className="py-3 pr-4 font-bold">소속 학교</th>
                  <th className="py-3 pr-4 font-bold">이메일</th>
                  <th className="py-3 pr-4 font-bold">가입일</th>
                  <th className="py-3 pr-4 font-bold">상태</th>
                  <th className="py-3 font-bold w-28" />
                </tr>
              </thead>
              <tbody className="block md:table-row-group divide-y divide-neutral-200">
                {members.map((m) => (
                  <tr key={m.id} className="block md:table-row py-3 md:py-0">
                    <td className="block md:table-cell py-0.5 md:py-4 md:pr-4 font-bold">{m.name || '-'}</td>
                    <td className="block md:table-cell py-0.5 md:py-4 md:pr-4">{m.school || '-'}</td>
                    <td className="block md:table-cell py-0.5 md:py-4 md:pr-4 text-neutral-600 break-all">{m.email}</td>
                    <td className="block md:table-cell py-0.5 md:py-4 md:pr-4 tabular-nums text-neutral-600">
                      <span className="md:hidden text-xs text-neutral-400">가입일 </span>
                      {m.created_at.slice(0, 10)}
                    </td>
                    <td className="block md:table-cell py-0.5 md:py-4 md:pr-4">
                      <span className={m.role === 'pending' ? 'font-bold' : 'text-neutral-600'}>{ROLE_LABEL[m.role]}</span>
                      {m.role === 'pending' && (
                        <span className={`block text-[11px] mt-0.5 ${m.email_confirmed_at ? 'text-neutral-500' : 'font-bold border-l-2 border-neutral-900 pl-1.5'}`}>
                          {m.email_confirmed_at ? '메일 인증 완료' : '메일 미인증'}
                        </span>
                      )}
                    </td>
                    <td className="block md:table-cell pt-2 md:py-4">
                      {m.role === 'pending' && m.email_confirmed_at && (
                        <button
                          type="button"
                          onClick={() => changeRole(m, 'teacher')}
                          className="flex items-center gap-1.5 bg-neutral-900 text-white px-3 py-1.5 text-xs font-bold hover:bg-neutral-700"
                        >
                          <Check size={13} /> 승인
                        </button>
                      )}
                      {m.role === 'pending' && !m.email_confirmed_at && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled
                            title="메일 인증을 마쳐야 승인할 수 있습니다"
                            className="flex items-center gap-1.5 border-2 border-neutral-200 text-neutral-400 px-3 py-1 text-xs font-bold cursor-not-allowed"
                          >
                            <Check size={13} /> 승인
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteUnconfirmed(m)}
                            aria-label={`${m.email} 가입 신청 삭제`}
                            className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900 underline"
                          >
                            삭제
                          </button>
                        </div>
                      )}
                      {m.role === 'teacher' && (
                        <button
                          type="button"
                          onClick={() => changeRole(m, 'pending')}
                          className="border-2 border-neutral-300 px-3 py-1 text-xs font-bold hover:border-neutral-900"
                        >
                          권한 해제
                        </button>
                      )}
                      {m.role === 'admin' && <span className="text-xs text-neutral-400">-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {members.length === 0 && <p className="text-sm text-neutral-500 py-6">가입한 회원이 없습니다.</p>}
          </div>
        )}
      </div>
    </main>
  );

  // ── 내 정보 화면 (이름·학교 수정 / 비밀번호 변경 / 회원 탈퇴, 이메일은 변경 불가) ──
  const totalEvaluations = [...students, ...trashed].reduce((sum, s) => sum + s.evaluations.length, 0);
  const msgLine = (m: FormMessage | null) =>
    m ? (
      <p className={`text-xs border-l-4 pl-2 py-0.5 ${m.type === 'error' ? 'border-neutral-900 font-semibold' : 'border-neutral-400 text-neutral-700'}`}>
        {m.text}
      </p>
    ) : null;

  const renderProfile = () => (
    <main className="p-4 md:p-8 print:hidden">
      <div className="max-w-2xl space-y-12">
        <section>
          <h2 className="text-lg font-bold border-b-4 border-neutral-900 pb-2 mb-5">기본 정보</h2>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold mb-2">이메일</p>
              <p className="border-2 border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600">{profile.email}</p>
              <p className="text-xs text-neutral-500 mt-1.5">
                이메일은 변경할 수 없습니다. 꼭 바꿔야 한다면 탈퇴 후 새 이메일로 다시 가입해 주세요.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="pf-name" className="block text-sm font-semibold mb-2">
                  이름
                </label>
                <input id="pf-name" className={inputClass} value={pfName} onChange={(e) => setPfName(e.target.value)} />
              </div>
              <div>
                <label htmlFor="pf-school" className="block text-sm font-semibold mb-2">
                  소속 학교
                </label>
                <input id="pf-school" className={inputClass} value={pfSchool} onChange={(e) => setPfSchool(e.target.value)} />
              </div>
            </div>
            <div>
              <label htmlFor="pf-contact" className="block text-sm font-semibold mb-2">
                연락처 <span className="font-normal text-neutral-500 text-xs">(선택)</span>
              </label>
              <input
                id="pf-contact"
                className={inputClass}
                value={pfContact}
                maxLength={40}
                onChange={(e) => setPfContact(e.target.value)}
                placeholder="예: 010-1234-5678 또는 학교 교무실 번호"
              />
              <p className="text-xs text-neutral-500 mt-1.5">
                입력하면 사장님께 보내는 학생소개서와 포트폴리오에 "돌발 상황 연락처"로 표시됩니다. 개인 번호 대신 학교 번호를 써도 됩니다.
              </p>
            </div>
            {profile.consented_at && (
              <p className="text-xs text-neutral-500">개인정보 동의: {profile.consented_at.slice(0, 10)} (버전 {profile.consent_version})</p>
            )}
            {msgLine(pfMsg)}
            <button
              type="button"
              onClick={saveProfile}
              disabled={pfSaving}
              className="flex items-center gap-2 bg-neutral-900 text-white text-sm font-bold px-6 py-2.5 hover:bg-neutral-700 transition-colors disabled:opacity-60"
            >
              {pfSaving && <Loader2 size={15} className="animate-spin" />} 저장
            </button>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold border-b-4 border-neutral-900 pb-2 mb-5">비밀번호 변경</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <input
                type="password"
                className={inputClass}
                placeholder="새 비밀번호 (8자 이상)"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                autoComplete="new-password"
              />
              <input
                type="password"
                className={inputClass}
                placeholder="새 비밀번호 확인"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            {msgLine(pwMsg)}
            <button
              type="button"
              onClick={changePassword}
              disabled={pwBusy}
              className="flex items-center gap-2 border-2 border-neutral-900 text-sm font-bold px-6 py-2 hover:bg-neutral-900 hover:text-white transition-colors disabled:opacity-60"
            >
              {pwBusy && <Loader2 size={15} className="animate-spin" />} 비밀번호 변경
            </button>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold border-b-4 border-neutral-900 pb-2 mb-5">회원 탈퇴</h2>
          {isAdmin ? (
            <p className="text-sm text-neutral-600 leading-relaxed">
              관리자 계정은 탈퇴할 수 없습니다. 관리자가 없으면 새 회원을 승인할 수 없기 때문입니다.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="border-2 border-neutral-900 p-5 text-sm leading-relaxed space-y-2">
                <p>
                  탈퇴하면 계정과 함께 <b>등록한 학생 {students.length + trashed.length}명, 평가 기록 {totalEvaluations}건</b>이 모두 삭제되며 되돌릴 수
                  없습니다.
                </p>
                <p className="text-neutral-600">
                  학생을 인계해야 한다면 탈퇴 전에 학생별 [통합 인사이트] 리포트를 인쇄해 두십시오. 발송한 사장님·자기평가 링크도 더
                  이상 열리지 않습니다.
                </p>
              </div>
              <div>
                <label htmlFor="del-email" className="block text-sm font-semibold mb-2">
                  확인을 위해 가입 이메일을 입력하십시오
                </label>
                <input
                  id="del-email"
                  className={inputClass}
                  value={delEmail}
                  onChange={(e) => setDelEmail(e.target.value)}
                  placeholder={profile.email}
                  autoComplete="off"
                />
              </div>
              {delError && <p className="text-xs font-semibold border-l-4 border-neutral-900 pl-2 py-0.5">{delError}</p>}
              <button
                type="button"
                onClick={deleteAccount}
                disabled={delBusy || delEmail.trim().toLowerCase() !== profile.email.toLowerCase()}
                className="flex items-center gap-2 bg-neutral-900 text-white text-sm font-bold px-6 py-2.5 hover:bg-neutral-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {delBusy && <Loader2 size={15} className="animate-spin" />} 회원 탈퇴
              </button>
            </div>
          )}
        </section>

        <section className="md:hidden">
          <button
            type="button"
            onClick={onSignOut}
            className="w-full flex items-center justify-center gap-2 border-2 border-neutral-900 py-3 text-sm font-bold"
          >
            <LogOut size={16} /> 로그아웃
          </button>
        </section>
      </div>
    </main>
  );

  const HEADER_DESC: Record<NavView, string> = {
    dashboard: '학생 대시보드 · 고용주 · 교사 · 학생 3자 평가 통합 관리',
    share: '평가 링크 공유 · 사장님 · 학생용 링크 관리',
    members: '회원 승인 · 연구회 교사 권한 관리',
    profile: '내 정보 · 계정 관리',
  };

  return (
    <div className="min-h-screen flex bg-white text-neutral-900 font-sans print:block">
      {renderNav()}
      <div className="flex-1 min-w-0 pb-20 md:pb-0 print:pb-0">
        <header className="border-b-4 border-neutral-900 px-4 py-3 md:px-8 md:py-5 flex justify-between items-end gap-4 print:hidden">
          <div>
            <h1 className="text-lg md:text-2xl font-black tracking-tighter">
              Link-路 <span className="hidden sm:inline font-bold text-neutral-500">나라T 직업교육 Lab</span>
            </h1>
            <p className="hidden sm:block text-sm text-neutral-500 mt-1">{HEADER_DESC[nav]}</p>
          </div>
          <div className="text-right text-xs">
            <p className="font-bold text-sm">
              {profile.name || profile.email} <span className="font-normal text-neutral-500">{ROLE_LABEL[profile.role]}</span>
            </p>
            <p className="hidden sm:block text-neutral-500 mt-0.5">{profile.school}</p>
            <p className="text-[11px] text-neutral-500 mt-1 flex items-center justify-end gap-1.5">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${liveStatus === 'live' ? 'bg-neutral-900' : 'bg-neutral-300'}`} />
              {liveStatus === 'live' ? '실시간 반영 중' : liveStatus === 'connecting' ? '연결 중' : '연결 끊김 · 새로고침 필요'}
            </p>
          </div>
        </header>
        {nav === 'dashboard' ? (
          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] lg:grid-cols-[340px_1fr] print:block">
            {renderSidebar()}
            <main className={`p-4 md:p-6 lg:p-8 min-w-0 print:p-0 print:block ${mobilePane === 'list' ? 'hidden md:block' : ''}`}>{renderDetail()}</main>
          </div>
        ) : nav === 'share' ? (
          renderShare()
        ) : nav === 'members' ? (
          renderMembers()
        ) : (
          renderProfile()
        )}
      </div>

      {renderBottomNav()}

      {(arrivals.length > 0 || undoStudent) && (
        <div className="fixed bottom-20 inset-x-4 md:inset-x-auto md:bottom-6 md:right-6 md:w-80 z-50 space-y-2 print:hidden" role="status" aria-live="polite">
          {undoStudent && (
            <div className="bg-neutral-900 text-white p-4 shadow-lg flex items-center justify-between gap-3">
              <p className="text-sm min-w-0">
                <b>{undoStudent.name}</b> 학생을 휴지통으로 옮겼습니다.
              </p>
              <button
                type="button"
                onClick={() => restoreStudent(undoStudent)}
                className="shrink-0 flex items-center gap-1 border border-white px-3 py-1.5 text-xs font-bold hover:bg-white hover:text-neutral-900 transition-colors"
              >
                <Undo2 size={13} /> 되돌리기
              </button>
            </div>
          )}
          {arrivals.map((a) => (
            <div key={a.id} className="bg-neutral-900 text-white p-4 shadow-lg">
              <div className="flex justify-between items-start gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] text-neutral-400">새 평가 도착</p>
                  <p className="text-sm font-bold mt-0.5 truncate">
                    {a.studentName} · {KIND_LABEL[a.kind]}
                  </p>
                  <p className="text-xs text-neutral-300 mt-1">
                    종합 {a.rate}%{a.evaluator ? ` · 평가자 ${a.evaluator}` : ''}
                  </p>
                </div>
                <button type="button" aria-label="알림 닫기" onClick={() => dismissArrival(a.id)} className="text-neutral-400 hover:text-white shrink-0">
                  <X size={16} />
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setNav('dashboard');
                  selectStudent(a.studentId);
                  setTab('history');
                  dismissArrival(a.id);
                }}
                className="mt-3 w-full border border-white py-1.5 text-xs font-bold hover:bg-white hover:text-neutral-900 transition-colors"
              >
                기록 보기
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// 7. 범례 (흑백 구분: 고용주 굵은 실선 / 교사 회색 점선 / 학생 옅은 회색 채움)
// ─────────────────────────────────────────────
function SeriesLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-[11px] mt-1">
      {KINDS.map((k) => {
        const st = SERIES_STYLE[k];
        return (
          <span key={k} className="flex items-center gap-1.5">
            <svg width="26" height="12" aria-hidden="true">
              {k === 'self' ? (
                <rect x="1" y="2" width="24" height="8" fill={st.fill} fillOpacity={st.fillOpacity} stroke={st.stroke} strokeWidth={1} />
              ) : (
                <line x1="0" y1="6" x2="26" y2="6" stroke={st.stroke} strokeWidth={st.strokeWidth} strokeDasharray={st.dash} />
              )}
            </svg>
            <span className="font-semibold">{KIND_SHORT[k]}</span>
          </span>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────
// 8. 시연 모드 (?demo=1)
//   · 로그인 없이 예시 선생님 계정과 예시 학생으로 동작 (관리자 메뉴 없음)
//   · 데이터는 이 브라우저 안에만 저장되고 실제 DB에는 저장하지 않음
//   · 선생님 화면을 새로고침하면 처음 상태로 돌아감
//   · 같은 브라우저의 다른 탭에서 사장님·학생 링크로 제출하면 선생님 탭에 실시간 알림
// ─────────────────────────────────────────────
type DemoRow = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type DemoDB = { students: DemoRow[]; evaluations: DemoRow[]; profiles: DemoRow[] };
type DemoResult = { data: any; error: { message: string } | null }; // eslint-disable-line @typescript-eslint/no-explicit-any
type DemoListener = { event: string; table: string; cb: (payload: { new: DemoRow; old: DemoRow }) => void };
type DemoBuilder = {
  select: (cols?: string) => DemoBuilder;
  insert: (v: DemoRow) => DemoBuilder;
  update: (v: DemoRow) => DemoBuilder;
  delete: () => DemoBuilder;
  eq: (col: string, v: unknown) => DemoBuilder;
  order: (col: string, opts?: { ascending?: boolean }) => DemoBuilder;
  single: () => DemoBuilder;
  maybeSingle: () => DemoBuilder;
  then: (resolve: (r: DemoResult) => unknown, reject?: (e: unknown) => unknown) => Promise<unknown>;
};
type DemoChannel = {
  on: (type: string, filter: { event: string; table: string }, cb: DemoListener['cb']) => DemoChannel;
  subscribe: (statusCb?: (status: string) => void) => DemoChannel;
  mine: DemoListener[];
};

function createDemoClient(reset: boolean) {
  let needsReset = reset; // 선생님 화면을 열 때마다 예시 데이터로 초기화 (링크 화면은 초기화하지 않음)
  let memory: DemoDB | null = null;
  const listeners: DemoListener[] = [];
  const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('linkro-demo') : null;
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
  const TABLE_KEY: Record<string, keyof DemoDB> = {
    portfolio_students: 'students',
    portfolio_evaluations: 'evaluations',
    portfolio_profiles: 'profiles',
  };

  const save = (db: DemoDB) => {
    memory = db;
    try {
      localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(db));
    } catch {
      // 저장소를 쓸 수 없으면 이 탭 안에서만 유지
    }
  };
  const load = (): DemoDB => {
    if (needsReset) {
      needsReset = false;
      const fresh = buildDemoSeed();
      save(fresh);
      return fresh;
    }
    try {
      const raw = localStorage.getItem(DEMO_STORAGE_KEY);
      if (raw) return JSON.parse(raw) as DemoDB;
    } catch {
      if (memory) return memory;
    }
    const fresh = memory ?? buildDemoSeed();
    save(fresh);
    return fresh;
  };

  const emitLocal = (event: string, table: string, row: DemoRow) => {
    listeners
      .filter((l) => l.event === event && l.table === table)
      .forEach((l) => window.setTimeout(() => l.cb({ new: row, old: row }), 0));
  };
  const notify = (event: string, table: string, row: DemoRow) => {
    emitLocal(event, table, row);
    bc?.postMessage({ event, table, row });
  };
  if (bc) bc.onmessage = (e: MessageEvent) => emitLocal(e.data.event, e.data.table, e.data.row);

  const withDefaults = (key: keyof DemoDB, p: DemoRow): DemoRow => {
    const base = { id: crypto.randomUUID(), created_at: new Date().toISOString() };
    if (key === 'students')
      return {
        ...base,
        site: null,
        teacher_id: DEMO_USER_ID,
        self_token: crypto.randomUUID(),
        employer_token: crypto.randomUUID(),
        intro: {},
        share_token: null,
        deleted_at: null,
        ...p,
      };
    if (key === 'evaluations')
      return { ...base, form: null, summary: null, comment: '', evaluator: null, input_method: null, evaluated_at: today(), ...p };
    return { ...base, ...p };
  };

  const from = (table: string): DemoBuilder => {
    const state = {
      op: 'select' as 'select' | 'insert' | 'update' | 'delete',
      payload: {} as DemoRow,
      filters: [] as [string, unknown][],
      order: null as null | { col: string; asc: boolean },
      cols: '*',
      mode: 'many' as 'many' | 'single' | 'maybe',
    };
    const run = (): DemoResult => {
      const db = load();
      const key = TABLE_KEY[table];
      if (!key) return { data: null, error: { message: `unknown table: ${table}` } };
      const match = (r: DemoRow) => state.filters.every(([c, v]) => r[c] === v);
      let rows: DemoRow[] = [];
      if (state.op === 'insert') {
        const row = withDefaults(key, state.payload);
        db[key].push(row);
        save(db);
        rows = [row];
        if (key === 'evaluations') notify('INSERT', table, row);
      } else if (state.op === 'update') {
        rows = db[key].filter(match);
        rows.forEach((r) => Object.assign(r, state.payload));
        save(db);
      } else if (state.op === 'delete') {
        rows = db[key].filter(match);
        db[key] = db[key].filter((r) => !match(r));
        if (key === 'students') {
          const ids = new Set(rows.map((r) => r.id));
          db.evaluations.filter((e) => ids.has(e.student_id)).forEach((e) => notify('DELETE', 'portfolio_evaluations', { id: e.id }));
          db.evaluations = db.evaluations.filter((e) => !ids.has(e.student_id));
        }
        if (key === 'evaluations') rows.forEach((r) => notify('DELETE', table, { id: r.id }));
        save(db);
      } else {
        rows = db[key].filter(match);
        if (state.order) {
          const { col, asc } = state.order;
          rows = [...rows].sort((a, b) => String(a[col]).localeCompare(String(b[col])) * (asc ? 1 : -1));
        }
        if (key === 'students' && state.cols.includes('portfolio_evaluations')) {
          rows = rows.map((r) => ({ ...r, portfolio_evaluations: db.evaluations.filter((e) => e.student_id === r.id) }));
        }
      }
      const out = clone(rows);
      if (state.mode === 'single') return out.length ? { data: out[0], error: null } : { data: null, error: { message: '데이터를 찾을 수 없습니다.' } };
      if (state.mode === 'maybe') return { data: out[0] ?? null, error: null };
      return { data: out, error: null };
    };
    const builder: DemoBuilder = {
      select: (cols = '*') => {
        state.cols = cols;
        return builder;
      },
      insert: (v) => {
        state.op = 'insert';
        state.payload = v;
        return builder;
      },
      update: (v) => {
        state.op = 'update';
        state.payload = v;
        return builder;
      },
      delete: () => {
        state.op = 'delete';
        return builder;
      },
      eq: (col, v) => {
        state.filters.push([col, v]);
        return builder;
      },
      order: (col, opts) => {
        state.order = { col, asc: opts?.ascending ?? true };
        return builder;
      },
      single: () => {
        state.mode = 'single';
        return builder;
      },
      maybeSingle: () => {
        state.mode = 'maybe';
        return builder;
      },
      then: (resolve, reject) => Promise.resolve().then(run).then(resolve, reject),
    };
    return builder;
  };

  const rpc = async (fn: string, args: DemoRow): Promise<DemoResult> => {
    const db = load();
    const byToken = (field: string) => db.students.find((s) => s[field] === args.p_token && !s.deleted_at);
    const tokenField = args.p_kind === 'ojt' ? 'employer_token' : 'self_token';
    if (fn === 'get_link_context') {
      const s = byToken(tokenField);
      if (!s) return { data: [], error: null };
      const isOjt = args.p_kind === 'ojt';
      return { data: [{ name: s.name, grade: s.grade, main_field: isOjt ? s.main_field : null, site: isOjt ? s.site : null }], error: null };
    }
    if (fn === 'submit_link_evaluation') {
      const s = byToken(tokenField);
      if (!s) return { data: null, error: { message: 'invalid token' } };
      const row = withDefaults('evaluations', {
        student_id: s.id,
        kind: args.p_kind,
        form: args.p_form,
        scores: args.p_scores,
        summary: args.p_kind === 'ojt' ? args.p_summary : null,
        comment: args.p_comment ?? '',
        evaluator: args.p_evaluator ?? null,
        input_method: 'link',
      });
      db.evaluations.push(row);
      save(db);
      notify('INSERT', 'portfolio_evaluations', row);
      return { data: null, error: null };
    }
    if (fn === 'get_shared_profile') {
      const s = byToken('share_token');
      if (!s) return { data: null, error: null };
      const t = db.profiles.find((p) => p.id === s.teacher_id) ?? {};
      const latest = (kind: string) => {
        const list = db.evaluations
          .filter((e) => e.student_id === s.id && e.kind === kind)
          .sort((a, b) => `${a.evaluated_at}${a.created_at}`.localeCompare(`${b.evaluated_at}${b.created_at}`));
        const e = list[list.length - 1];
        return e ? { kind: e.kind, form: e.form, scores: e.scores, summary: e.summary, evaluated_at: e.evaluated_at } : null;
      };
      return {
        data: {
          name: s.name,
          grade: s.grade,
          main_field: s.main_field,
          site: s.site,
          intro: s.intro,
          teacher: { name: t.name, school: t.school, contact: t.contact },
          ojt: latest('ojt'),
          training: latest('teacher'),
        },
        error: null,
      };
    }
    if (fn === 'delete_my_portfolio_account') return { data: null, error: { message: '시연 모드에서는 탈퇴할 수 없습니다.' } };
    return { data: null, error: { message: `unknown rpc: ${fn}` } };
  };

  const session = { user: { id: DEMO_USER_ID, email: 'demo@linkro.kr' } };
  const unavailable = (what: string) => async () => ({ data: { session: null }, error: { message: `시연 모드에서는 ${what}할 수 없습니다.` } });
  const auth = {
    getSession: async () => ({ data: { session }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    signInWithPassword: async () => ({ data: { session }, error: null }),
    signUp: unavailable('가입'),
    resetPasswordForEmail: unavailable('비밀번호를 재설정'),
    updateUser: unavailable('비밀번호를 변경'),
    signOut: async () => {
      window.location.href = window.location.pathname; // 로그아웃 = 시연 종료
      return { error: null };
    },
  };

  const channel = (): DemoChannel => {
    const ch: DemoChannel = {
      mine: [],
      on: (_type, filter, cb) => {
        ch.mine.push({ event: filter.event, table: filter.table, cb });
        return ch;
      },
      subscribe: (statusCb) => {
        listeners.push(...ch.mine);
        window.setTimeout(() => statusCb?.('SUBSCRIBED'), 0);
        return ch;
      },
    };
    return ch;
  };
  const removeChannel = async (ch: DemoChannel) => {
    ch.mine.forEach((l) => {
      const i = listeners.indexOf(l);
      if (i >= 0) listeners.splice(i, 1);
    });
    return 'ok';
  };

  return { from, rpc, auth, channel, removeChannel };
}

// 시연용 예시 데이터 (날짜는 오늘을 기준으로 자동 계산)
function buildDemoSeed(): DemoDB {
  const ago = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  };
  const scoresOf = (form: FormKey, values: number[]) =>
    Object.fromEntries(allItems(FORMS[form]).map((item, i) => [item.id, values[i] ?? 3]));
  let seq = 0;
  const ev = (studentNo: number, kind: Kind, form: FormKey, days: number, values: number[], extra: DemoRow = {}): DemoRow => {
    seq += 1;
    return {
      id: `demo-ev-${seq}`,
      student_id: `demo-st-${studentNo}`,
      kind,
      form,
      scores: scoresOf(form, values),
      summary: null,
      comment: '',
      evaluator: null,
      input_method: kind === 'self' ? 'link' : null,
      evaluated_at: ago(days),
      created_at: `${ago(days)}T09:${String(seq).padStart(2, '0')}:00.000Z`,
      ...extra,
    };
  };
  const token = (group: number, n: number) => `00000000-0000-4000-8000-000000000${group}${String(n).padStart(2, '0')}`;
  const st = (n: number, name: string, grade: string, main_field: string, site: string | null, intro: DemoRow = {}, share = false): DemoRow => ({
    id: `demo-st-${n}`,
    name,
    grade,
    main_field,
    site,
    created_at: `2026-03-0${n}T09:00:00.000Z`,
    teacher_id: DEMO_USER_ID,
    self_token: token(1, n),
    employer_token: token(2, n),
    intro,
    share_token: share ? token(3, n) : null,
  });

  const students = [
    st(
      1,
      '김민준',
      '고2',
      '바리스타 보조',
      '온가든 카페',
      {
        headline: '성실한 예비 바리스타 김민준입니다',
        keywords: ['끝까지 해내는 끈기', '밝은 인사', '위생 수칙 철저'],
        strength: '한 번 배운 음료 레시피는 순서를 정확히 지켜 끝까지 완성합니다. 매장 정리와 설거지 같은 반복 업무를 바로 맡기셔도 됩니다.',
        tip: '"이거 하고 저거 해"보다 "컵 10개를 닦으면, 다음에 테이블을 정리하세요"처럼 순서를 끊어서 말씀해 주세요.',
        support: '주문이 몰리면 잠시 멈출 수 있습니다. "순서대로 하면 돼요" 한마디면 금세 페이스를 찾습니다.',
        notes: { selfcare: '지각 0회, 복장 단정', receptive: '모르면 손을 들어 질문함' },
      },
      true
    ),
    st(
      2,
      '이서연',
      '전공과',
      '제과제빵 보조',
      '드림베이커리',
      {
        headline: '꼼꼼한 제과 보조 이서연입니다',
        keywords: ['정확한 계량', '성실한 근태', '끝까지 집중'],
        strength: '계량과 포장 작업의 정확도가 매우 높고, 한 번 익힌 공정은 끝까지 집중해서 완수합니다.',
        tip: '작업 순서가 바뀔 때는 하루 전에 미리 알려 주시면 안정적으로 적응합니다.',
        support: '처음 하는 일 앞에서 긴장하면 말수가 줄어듭니다. 시범을 한 번 보여 주시면 바로 따라 합니다.',
        notes: { attitude: '지각 0회, 위생 기준 완벽', performance: '불량 0%, 속도는 요구량의 90%' },
      },
      true
    ),
    st(3, '박지호', '중3', '화장지 공장', null),
    st(4, '최유나', '고3', '레스토랑 외식서비스', '레스토랑 다정'),
    st(5, '정하늘', '고1', '사무 보조', '더불어삶'),
    st(6, '한도윤', '중2', '물류 포장', null),
  ];

  const evaluations = [
    // 김민준 (고2 · 저학년 양식)
    ev(1, 'teacher', 'teacher', 60, [3, 3, 2, 2, 2, 1, 2, 3, 3, 3, 2], {
      summary: 'basic',
      comment: '[지도 목표] 도움 요청 카드를 사용해 모르는 상황을 알린다.\n[중재 계획] 교내 카페 실습 시작 전 요청 카드 사용을 시범 보인다.',
    }),
    ev(1, 'ojt', 'ojt_junior', 14, [4, 4, 3, 3, 3, 2, 3, 4, 4, 4, 0], {
      summary: 'advanced',
      input_method: 'link',
      evaluator: '박온가 점장',
      comment: '위생 수칙을 매번 잘 지키고 인사를 밝게 합니다. 주문이 몰릴 때 순서를 짚어 주면 잘 따라옵니다.',
    }),
    ev(1, 'self', 'self_junior', 13, [3, 3, 3, 3, 3, 2, 3, 3, 3], {
      comment: '[오늘 내가 가장 잘한 점은?] 라떼를 10잔 만들었어요.\n[내일 나의 다짐 (목표)!] 모르면 먼저 물어볼게요.',
    }),
    ev(1, 'teacher', 'teacher', 10, [4, 3, 3, 3, 3, 2, 3, 4, 4, 3, 3], {
      summary: 'advanced',
      comment: '[지도 목표] 요청 카드 없이 말로 "도와주세요"를 요청한다 (주 3회 이상).\n[중재 계획] 실패 상황 역할극 후 진정 루틴을 연습하고 성공 시 즉시 칭찬한다.',
    }),
    // 이서연 (전공과 · 취업 실습 양식)
    ev(2, 'ojt', 'ojt_senior', 55, [4, 4, 3, 3, 2, 3, 4, 3, 3, 4, 4, 3, 2, 3, 2, 3], {
      summary: 'positive',
      input_method: 'link',
      evaluator: '이드림 실장',
      comment: '계량이 꼼꼼합니다. 작업 순서가 바뀌면 불안해하니 미리 알려 주시면 좋겠습니다.',
    }),
    ev(2, 'teacher', 'teacher', 20, [4, 4, 4, 4, 4, 3, 4, 4, 4, 4, 3], {
      summary: 'advanced',
      comment: '[지도 목표] 낯선 공정에서도 먼저 질문한다.\n[중재 계획] 새 공정 투입 전 시범 1회와 사진 체크리스트를 제공한다.',
    }),
    ev(2, 'ojt', 'ojt_senior', 5, [4, 4, 4, 4, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 3, 4], {
      summary: 'hire',
      input_method: 'link',
      evaluator: '이드림 실장',
      comment: '정확도가 매우 높고 한 번 익힌 공정은 끝까지 완수합니다. TO가 생기면 채용하고 싶습니다.',
    }),
    ev(2, 'self', 'self_senior', 4, [3, 3, 2, 3, 3, 3, 3, 2, 3, 2, 2], {
      comment:
        '[오늘 내가 가장 잘한 점은?] 쿠키 포장 100개를 실수 없이 했어요.\n[오늘 사장님(관리자)에게 칭찬받은 점은?] 계량이 정확하다고 칭찬받았어요.\n[내일 나의 다짐 (목표)!] 모르는 것은 먼저 질문하겠습니다.',
    }),
    // 박지호 (중3 · 교내 훈련 중심)
    ev(3, 'teacher', 'teacher', 180, [2, 2, 1, 1, 2, 1, 1, 2, 2, 2, 1], {
      summary: 'intensive',
      comment: '[지도 목표] 시각 타이머를 보며 10분간 착석한다.\n[중재 계획] 착석 성공 시 토큰 강화, 이탈 시 휴식 카드 사용을 지도한다.',
    }),
    ev(3, 'teacher', 'teacher', 15, [2, 3, 2, 2, 2, 1, 2, 3, 3, 2, 1], {
      summary: 'basic',
      comment: '[지도 목표] 시각 타이머를 보며 20분간 착석하여 포장 과제를 유지한다.\n[중재 계획] 10개 단위 완료 체크보드와 "괜찮아, 다시" 카드를 사용한다.',
    }),
    ev(3, 'self', 'self_junior', 14, [3, 2, 1, 2, 2, 2, 3, 2, 1], {
      comment: '[오늘 내가 가장 잘한 점은?] 휴지를 20개 접었어요.\n[내일 나의 다짐 (목표)!] 화가 나도 참을게요.',
    }),
    // 최유나 (고3 · 취업 실습 양식, 고용주 평가 대리 입력 예시)
    ev(4, 'teacher', 'teacher', 30, [4, 4, 3, 4, 3, 3, 3, 3, 4, 4, 2], {
      summary: 'advanced',
      comment: '[지도 목표] 바쁜 시간대에도 주문 순서를 스스로 확인한다.\n[중재 계획] 주문표 확인 루틴을 교내 실습에서 반복한다.',
    }),
    ev(4, 'ojt', 'ojt_senior', 8, [4, 4, 4, 4, 3, 3, 4, 3, 2, 4, 4, 3, 3, 3, 2, 0], {
      summary: 'positive',
      input_method: 'phone',
      evaluator: '정다정 점장',
      comment: '손님 응대가 친절합니다. 점심시간처럼 바쁠 때 당황하는 모습이 있어 연습이 더 필요합니다.',
    }),
    // 정하늘 (고1 · 저학년 양식)
    ev(5, 'teacher', 'teacher', 25, [3, 3, 3, 3, 2, 2, 3, 3, 3, 3, 3], {
      summary: 'basic',
      comment: '[지도 목표] 지적을 받았을 때 바로 방법을 바꿔 시도한다.\n[중재 계획] 피드백 후 "다시 해 볼게요" 말하기를 연습한다.',
    }),
    ev(5, 'ojt', 'ojt_junior', 3, [3, 4, 3, 3, 3, 2, 3, 3, 4, 3, 3], {
      summary: 'basic',
      input_method: 'link',
      evaluator: '최더불 팀장',
      comment: '서류 정리를 꼼꼼히 합니다. 막히면 혼자 멈춰 있는 경우가 있어 먼저 물어봐 주시면 좋겠습니다.',
    }),
    // 한도윤 (중2 · 아직 평가 없음)
  ];

  const profiles = [
    {
      id: DEMO_USER_ID,
      email: 'demo@linkro.kr',
      name: '김나라',
      school: '나라고등학교',
      role: 'teacher',
      created_at: '2026-03-01T00:00:00.000Z',
      contact: '010-0000-0000',
      consent_version: CONSENT_VERSION,
      consented_at: '2026-03-01T00:00:00.000Z',
      email_confirmed_at: '2026-03-01T00:00:00.000Z',
    },
  ];

  return { students, evaluations, profiles };
}

function DemoBanner() {
  const isLinkPage = ['ojt', 'self', 'intro'].includes(urlParams.get('view') ?? '');
  return (
    <div className="bg-neutral-100 border-b-2 border-neutral-900 px-4 py-2 text-xs flex flex-wrap items-center justify-between gap-2 print:hidden">
      <p>
        <b>시연 모드</b> · 예시 데이터로 동작하며 실제 DB에는 저장되지 않습니다.
        {isLinkPage ? '' : ' 새로고침하면 처음 상태로 돌아갑니다.'}
      </p>
      {!isLinkPage && (
        <div className="flex gap-3">
          <button type="button" onClick={() => window.location.reload()} className="underline font-semibold">
            처음 상태로
          </button>
          <a href={window.location.pathname} className="underline">
            시연 종료
          </a>
        </div>
      )}
    </div>
  );
}