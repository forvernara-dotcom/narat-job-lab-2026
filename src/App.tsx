import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
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
  Search,
  ChevronDown,
  ChevronRight,
  X,
} from 'lucide-react';

// ─────────────────────────────────────────────
// 0. Supabase 설정
// ─────────────────────────────────────────────
const SUPABASE_URL = 'https://rvhnvvszispxyrjdihqj.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2aG52dnN6aXNweHlyamRpaHFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3ODEyMDMsImV4cCI6MjEwNjM1NzIwM30.1M4yy-NQ6k2ZuUJRz6pcl1JLdn8NC-1kIubfXvpknJQ';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const STUDENTS_TABLE = 'portfolio_students';
const EVALUATIONS_TABLE = 'portfolio_evaluations';
const PROFILES_TABLE = 'portfolio_profiles';
const EVAL_COLUMNS = 'id, student_id, kind, scores, summary, comment, evaluator, evaluated_at, created_at';
const STUDENT_COLUMNS = 'id, name, grade, main_field, site, created_at, self_token, employer_token';
const PROFILE_COLUMNS = 'id, email, name, school, role, created_at';

// ─────────────────────────────────────────────
// 1. 타입
// ─────────────────────────────────────────────
type Kind = 'ojt' | 'teacher' | 'self';
type StaffKind = 'ojt' | 'teacher';
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
};
type ScaleOption = { value: number; label: string; desc: string };
type RubricItem = { id: string; label: string; prompt?: string };
type Domain = { key: string; title: string; items: RubricItem[] };
type Option = { value: string; label: string };

type Rubric = {
  kind: Kind;
  label: string;
  scale: ScaleOption[];
  max: number;
  domains: Domain[];
  summaryTitle: string;
  summaryOptions: Option[];
  commentTitle: string;
  commentPlaceholder: string;
};

// 평가 1건 = DB 1행. 학생은 모든 평가 히스토리를 배열로 가짐
type EvaluationRow = {
  id: string;
  student_id: string;
  kind: Kind;
  scores: Record<string, number>;
  summary: string | null;
  comment: string;
  evaluator: string | null; // 링크로 평가한 사장님 성함 (선택)
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
  portfolio_evaluations: RawEvaluationRow[] | null;
};

type Draft = {
  kind: StaffKind;
  date: string;
  scores: Record<string, number>;
  summary: string | null;
  comment: string;
};

// ─────────────────────────────────────────────
// 2. 척도 및 루브릭
// ─────────────────────────────────────────────
const SCALE4: ScaleOption[] = [
  { value: 4, label: '독립적 수행', desc: '지시·촉구 없이 스스로 상황에 맞게 행동' },
  { value: 3, label: '최소 지원', desc: '1~2회의 가벼운 언어적·시각적 촉구가 있으면 수행' },
  { value: 2, label: '집중 지원', desc: '지속적인 안내와 감독이 있어야 유지' },
  { value: 1, label: '수행 어려움', desc: '즉각적인 중재 필요' },
];

const SCALE3: ScaleOption[] = [
  { value: 3, label: '우수', desc: '혼자서 잘해요' },
  { value: 2, label: '보통', desc: '가끔 도움이 필요해요' },
  { value: 1, label: '노력필요', desc: '더 연습할래요' },
];

const RUBRICS: Record<Kind, Rubric> = {
  ojt: {
    kind: 'ojt',
    label: '고용주 (OJT)',
    scale: SCALE4,
    max: 4,
    domains: [
      {
        key: 'attitude',
        title: '기본 직업 태도',
        items: [
          { id: 'a1', label: '위생 및 복장' },
          { id: 'a2', label: '시간 엄수 및 근태' },
          { id: 'a3', label: '휴게 시간 준수' },
        ],
      },
      {
        key: 'communication',
        title: '의사소통 및 대인관계',
        items: [
          { id: 'c1', label: '지시 수용' },
          { id: 'c2', label: '도움 요청 (자기옹호)' },
          { id: 'c3', label: '직장 예절' },
        ],
      },
      {
        key: 'engagement',
        title: '직무 참여 및 감정 조절',
        items: [
          { id: 'e1', label: '과제 지속성' },
          { id: 'e2', label: '감정 조절 / 스트레스 대처' },
          { id: 'e3', label: '안전 수칙 준수' },
        ],
      },
      {
        key: 'performance',
        title: '실제 직무 성과 및 유연성',
        items: [
          { id: 'p1', label: '작업 정확성 (품질)' },
          { id: 'p2', label: '작업 속도 (할당량)' },
          { id: 'p3', label: '돌발 상황 적응력 (유연성)' },
        ],
      },
    ],
    summaryTitle: '고용주 최종 만족도',
    summaryOptions: [
      { value: 'hire', label: '즉시 채용 수준' },
      { value: 'positive', label: '긍정적 검토 수준' },
      { value: 'training', label: '추가 훈련 필요' },
    ],
    commentTitle: '고용주 종합 의견 (강점 및 실전 사용 설명서)',
    commentPlaceholder:
      '[강점] 현장에서 확인된 강점을 적어주세요.\n[실전 사용 설명서] 이 학생과 함께 일할 때 효과적인 지시 방법, 배려가 필요한 상황을 적어주세요.',
  },
  teacher: {
    kind: 'teacher',
    label: '교사 (교내)',
    scale: SCALE4,
    max: 4,
    domains: [
      {
        key: 'selfcare',
        title: '기본 직무태도 (자기관리)',
        items: [
          { id: 't_a1', label: '위생 및 복장' },
          { id: 't_a2', label: '시간 엄수' },
          { id: 't_a3', label: '정리 정돈' },
        ],
      },
      {
        key: 'receptive',
        title: '의사소통 및 수용성',
        items: [
          { id: 't_c1', label: '지시 집중력' },
          { id: 't_c2', label: '행동 교정 수용' },
          { id: 't_c3', label: '자기 옹호 (도움 요청)' },
        ],
      },
      {
        key: 'persistence',
        title: '과제 지속성',
        items: [
          { id: 't_p1', label: '착석 및 과제 유지' },
          { id: 't_p2', label: '반복 작업 인내력' },
        ],
      },
      {
        key: 'safety',
        title: '안전수칙 준수 및 감정 조절',
        items: [
          { id: 't_s1', label: '작업장 안전수칙 준수' },
          { id: 't_s2', label: '기본 안전 인지' },
          { id: 't_s3', label: '실패 시 감정 조절' },
        ],
      },
    ],
    summaryTitle: '현재 전환 핵심 기술 도달 수준',
    summaryOptions: [
      { value: 'advanced', label: '심화 훈련 가능' },
      { value: 'basic', label: '기초 훈련 지속' },
      { value: 'intensive', label: '집중 행동 중재 요망' },
    ],
    commentTitle: '지도 목표 설정 및 중재 계획',
    commentPlaceholder:
      '[지도 목표] 다음 평가까지 도달할 구체적인 행동 목표를 적어주세요.\n[중재 계획] 사용할 촉구 방법, 시각 자료, 강화 방법을 적어주세요.',
  },
  self: {
    kind: 'self',
    label: '학생 (자기평가)',
    scale: SCALE3,
    max: 3,
    domains: [
      {
        key: 'basic',
        title: '기초 생활',
        items: [
          { id: 's_b1', label: '위생', prompt: '일하기 전에 손을 씻고, 깨끗한 옷을 입어요.' },
          { id: 's_b2', label: '시간 준수', prompt: '정해진 시간에 맞춰 도착해요.' },
        ],
      },
      {
        key: 'advocacy',
        title: '자기옹호',
        items: [
          { id: 's_a1', label: '인사', prompt: '만나는 사람에게 먼저 인사해요.' },
          { id: 's_a2', label: '질문하기', prompt: '모를 때 "어떻게 해요?", "도와주세요"라고 물어봐요.' },
        ],
      },
      {
        key: 'persistence',
        title: '과제 지속성',
        items: [{ id: 's_p1', label: '포기하지 않기', prompt: '어려워도 끝까지 해요.' }],
      },
      {
        key: 'emotion',
        title: '감정 조절',
        items: [
          { id: 's_e1', label: '안전수칙', prompt: '위험한 도구는 배운 대로 조심해서 써요.' },
          { id: 's_e2', label: '화내지 않기', prompt: '화가 나도 소리 지르지 않고 마음을 가라앉혀요.' },
        ],
      },
    ],
    summaryTitle: '',
    summaryOptions: [],
    commentTitle: '선생님께 하고 싶은 말',
    commentPlaceholder: '하고 싶은 말이 있으면 적어 주세요. (안 적어도 괜찮아요)',
  },
};

const KINDS: Kind[] = ['ojt', 'teacher', 'self'];
const KIND_SHORT: Record<Kind, string> = { ojt: '고용주', teacher: '교사', self: '학생' };

// 3자 통합 차트용 공통 축: 의미가 같은 항목끼리 묶어 달성률(%)로 비교
const INTEGRATED_AXES: { key: string; label: string; items: Record<Kind, string[]> }[] = [
  {
    key: 'selfcare',
    label: '자기관리',
    items: { ojt: ['a1', 'a2', 'a3'], teacher: ['t_a1', 't_a2', 't_a3'], self: ['s_b1', 's_b2'] },
  },
  {
    key: 'advocacy',
    label: '의사소통·자기옹호',
    items: { ojt: ['c1', 'c2', 'c3'], teacher: ['t_c1', 't_c2', 't_c3'], self: ['s_a1', 's_a2'] },
  },
  {
    key: 'persistence',
    label: '과제 지속성',
    items: { ojt: ['e1'], teacher: ['t_p1', 't_p2'], self: ['s_p1'] },
  },
  {
    key: 'safety',
    label: '안전·감정 조절',
    items: { ojt: ['e2', 'e3'], teacher: ['t_s1', 't_s2', 't_s3'], self: ['s_e1', 's_e2'] },
  },
];

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
const rateOf = (scores: Record<string, number>, ids: string[], max: number) => {
  if (ids.length === 0) return 0;
  const sum = ids.reduce((acc, id) => acc + (scores[id] ?? 0), 0);
  return Math.round((sum / (ids.length * max)) * 100);
};
const overallRate = (row: EvaluationRow) => {
  const rubric = RUBRICS[row.kind];
  return rateOf(row.scores, allItems(rubric).map((i) => i.id), rubric.max);
};
const domainRate = (row: EvaluationRow, domain: Domain) =>
  rateOf(row.scores, domain.items.map((i) => i.id), RUBRICS[row.kind].max);
const axisRate = (row: EvaluationRow, axis: (typeof INTEGRATED_AXES)[number]) =>
  rateOf(row.scores, axis.items[row.kind], RUBRICS[row.kind].max);
const optionLabel = (kind: Kind, value: string | null) =>
  RUBRICS[kind].summaryOptions.find((o) => o.value === value)?.label ?? '-';

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
const emptyDraft = (kind: StaffKind): Draft => ({ kind, date: today(), scores: {}, summary: null, comment: '' });
const linkFor = (kind: LinkKind, token: string) =>
  `${window.location.origin}${window.location.pathname}?view=${kind}&t=${encodeURIComponent(token)}`;

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
  'w-full border-2 border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:border-neutral-900 bg-white';

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
  return (
    <>
      <style>{PRINT_CSS}</style>
      {linkKind && token ? <LinkEvaluationPage kind={linkKind} token={token} /> : <AuthGate />}
    </>
  );
}

// ─────────────────────────────────────────────
// 5-1. 링크 평가 화면 (사장님 OJT / 학생 자기평가 공용)
// ─────────────────────────────────────────────
type LinkContext = { name: string; grade: string | null; main_field: string | null; site: string | null };

function LinkEvaluationPage({ kind, token }: { kind: LinkKind; token: string }) {
  const rubric = RUBRICS[kind];
  const isSelf = kind === 'self';
  const [ctx, setCtx] = useState<LinkContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [scores, setScores] = useState<Record<string, number>>({});
  const [summary, setSummary] = useState<string | null>(null);
  const [comment, setComment] = useState('');
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

  const items = allItems(rubric);
  const answered = items.filter((i) => scores[i.id] != null).length;

  const handleSubmit = async () => {
    const remaining = items.length - answered;
    if (remaining > 0) {
      setSubmitError(isSelf ? `아직 고르지 않은 질문이 ${remaining}개 있어요.` : `평가하지 않은 항목이 ${remaining}개 있습니다.`);
      return;
    }
    if (!isSelf && !summary) {
      setSubmitError(`${rubric.summaryTitle}를 선택해 주십시오.`);
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    const { error } = await supabase.rpc('submit_link_evaluation', {
      p_token: token,
      p_kind: kind,
      p_scores: scores,
      p_summary: isSelf ? null : summary,
      p_comment: comment.trim(),
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
      <header className="border-b-4 border-neutral-900 px-6 py-4">
        <p className="text-lg font-black tracking-tighter">Link-路 <span className="font-bold text-neutral-500">나라T 직업교육 Lab</span></p>
      </header>
      <main className="max-w-2xl mx-auto px-6 py-10">{children}</main>
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
      <div className="border-2 border-neutral-900 p-10 text-center space-y-4">
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
              바쁘신 중에 시간 내어 주셔서 감사합니다. 평가 내용은 담당 선생님께 바로 전달됩니다.
              <br />
              다음 평가 때도 같은 링크를 사용하시면 됩니다.
            </p>
          </>
        )}
      </div>
    );

  const promptClass = isSelf ? 'text-lg font-semibold mb-4 leading-relaxed' : 'text-base font-semibold mb-3';

  return shell(
    <div className="space-y-12">
      <div>
        {isSelf ? (
          <>
            <h1 className="text-3xl font-black tracking-tight">{ctx.name}님의 자기평가</h1>
            <p className="text-lg text-neutral-600 mt-3 leading-relaxed">요즘 일할 때 나의 모습을 생각하며, 질문마다 하나씩 골라 주세요.</p>
          </>
        ) : (
          <>
            <p className="text-sm text-neutral-500">현장실습(OJT) 평가</p>
            <h1 className="text-3xl font-black tracking-tight mt-1">{ctx.name} 학생</h1>
            <p className="text-sm text-neutral-600 mt-2">
              {[ctx.site, ctx.main_field, ctx.grade].filter(Boolean).join(' · ')}
            </p>
            <p className="text-base text-neutral-700 mt-5 leading-relaxed border-l-4 border-neutral-900 pl-4">
              학생이 현장에서 보인 모습을 기준으로 항목마다 하나씩 선택해 주십시오. 약 3분이 걸리며, 가입이나 로그인 없이 바로
              제출됩니다.
            </p>
          </>
        )}
      </div>

      {!isSelf && (
        <section>
          <h2 className="text-sm font-bold mb-3">평가 기준</h2>
          <div className="grid grid-cols-2 gap-0.5 bg-neutral-900 border-2 border-neutral-900">
            {rubric.scale.map((sc) => (
              <div key={sc.value} className="bg-white p-4">
                <p className="text-lg font-black">
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
          <h2 className="text-xl font-bold border-b-4 border-neutral-900 pb-2 mb-2">
            {di + 1}. {domain.title}
          </h2>
          <div className="divide-y divide-neutral-200">
            {domain.items.map((item) => (
              <div key={item.id} className={isSelf ? 'py-6' : 'py-5'}>
                <p className={promptClass}>{item.prompt ?? item.label}</p>
                <div className={`grid gap-2 ${isSelf ? 'grid-cols-3 gap-3' : 'grid-cols-4'}`}>
                  {rubric.scale.map((sc) => {
                    const active = scores[item.id] === sc.value;
                    return (
                      <button
                        key={sc.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setScores((prev) => ({ ...prev, [item.id]: sc.value }))}
                        className={`border-2 transition-colors ${isSelf ? 'py-4' : 'py-3'} ${
                          active ? 'bg-neutral-900 border-neutral-900 text-white' : 'border-neutral-300 hover:border-neutral-900'
                        }`}
                      >
                        {isSelf ? (
                          <>
                            <span className="block text-xl font-black">{sc.label}</span>
                            <span className={`block text-sm mt-1 ${active ? 'text-neutral-300' : 'text-neutral-500'}`}>{sc.desc}</span>
                          </>
                        ) : (
                          <>
                            <span className="block text-base font-black">{sc.value}</span>
                            <span className={`block text-xs mt-0.5 ${active ? 'text-neutral-300' : 'text-neutral-500'}`}>{sc.label}</span>
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {!isSelf && (
        <section>
          <h2 className="text-xl font-bold border-b-4 border-neutral-900 pb-2 mb-4">{rubric.summaryTitle}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {rubric.summaryOptions.map((opt) => {
              const active = summary === opt.value;
              return (
                <label
                  key={opt.value}
                  className={`flex items-center gap-3 border-2 px-4 py-3 cursor-pointer text-sm font-semibold transition-colors ${
                    active ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 hover:border-neutral-900'
                  }`}
                >
                  <input
                    type="radio"
                    name="link-summary"
                    value={opt.value}
                    checked={active}
                    onChange={() => setSummary(opt.value)}
                    className="accent-neutral-900"
                  />
                  {opt.label}
                </label>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <label htmlFor="link-comment" className="block text-xl font-bold border-b-4 border-neutral-900 pb-2 mb-4">
          {isSelf ? rubric.commentTitle : '종합 의견 (선택)'}
        </label>
        <textarea
          id="link-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={2000}
          placeholder={rubric.commentPlaceholder}
          className={`w-full h-36 border-2 border-neutral-300 p-4 focus:outline-none focus:border-neutral-900 ${isSelf ? 'text-lg' : 'text-sm leading-relaxed'}`}
        />
        {!isSelf && (
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
        )}
      </section>

      <div className="space-y-3">
        <p className="text-base text-neutral-600">
          {answered} / {items.length}개 {isSelf ? '골랐어요' : '항목 평가 완료'}
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
// 5-2. 로그인 · 가입 · 승인 대기
// ─────────────────────────────────────────────
function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-neutral-900 font-sans flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <p className="text-2xl font-black tracking-tighter">Link-路 <span className="font-bold text-neutral-500">나라T 직업교육 Lab</span></p>
        <p className="text-sm text-neutral-500 mt-1 mb-8">현장실습 직무 역량 평가</p>
        <div className="border-2 border-neutral-900 p-8">
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

type AuthMode = 'login' | 'signup' | 'reset';

function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [school, setSchool] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const switchMode = (m: AuthMode) => {
    setMode(m);
    setError('');
    setInfo('');
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
        options: { emailRedirectTo: redirectTo, data: { name: name.trim(), school: school.trim() } },
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
          <button type="button" onClick={() => switchMode('reset')} className="underline hover:text-neutral-900">
            비밀번호를 잊으셨나요?
          </button>
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
  if (!profile || (profile.role !== 'teacher' && profile.role !== 'admin')) {
    return <PendingScreen email={session.user.email ?? ''} error={profileError} onRefresh={loadProfile} onSignOut={signOut} />;
  }
  return <TeacherApp profile={profile} onSignOut={signOut} onProfileUpdated={setProfile} />;
}

// ─────────────────────────────────────────────
// 6. 교사용 앱
// ─────────────────────────────────────────────
type NavView = 'dashboard' | 'share' | 'members' | 'profile';
type Tab = 'new' | 'history' | 'insight';

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
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nav, setNav] = useState<NavView>('dashboard');
  const [tab, setTab] = useState<Tab>('insight');
  const [form, setForm] = useState({ name: '', grade: GRADES[0], mainField: '', site: '' });
  const [formError, setFormError] = useState('');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft('ojt'));
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
  const savingKeyRef = useRef<string | null>(null); // 내가 지금 저장 중인 평가 (알림 중복 방지)
  const studentsRef = useRef<Student[]>([]);

  const selected = students.find((s) => s.id === selectedId) ?? null;

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
      const list = ((data ?? []) as unknown as StudentRow[]).map(toStudent);
      setStudents(list);
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
  };

  const handleDeleteStudent = async (student: Student) => {
    if (!window.confirm(`${student.name} 학생과 모든 평가 기록을 삭제합니다. 되돌릴 수 없습니다. 계속할까요?`)) return;
    const { error } = await supabase.from(STUDENTS_TABLE).delete().eq('id', student.id);
    if (error) {
      window.alert(`삭제하지 못했습니다: ${error.message}`);
      return;
    }
    const remaining = students.filter((s) => s.id !== student.id);
    setStudents(remaining);
    if (selectedId === student.id) setSelectedId(remaining[0]?.id ?? null);
  };

  // ── 새 평가 저장 (누적 insert) ──
  const changeDraftKind = (kind: StaffKind) => {
    if (kind === draft.kind) return;
    const hasInput = Object.keys(draft.scores).length > 0 || draft.comment.trim() !== '';
    if (hasInput && !window.confirm('입력 중인 내용이 지워집니다. 평가 종류를 바꿀까요?')) return;
    setDraft(emptyDraft(kind));
    setDraftError('');
  };

  const handleSaveDraft = async () => {
    if (!selected) return;
    const rubric = RUBRICS[draft.kind];
    const missing = allItems(rubric).filter((i) => draft.scores[i.id] == null).length;
    if (missing > 0) {
      setDraftError(`채점하지 않은 항목이 ${missing}개 있습니다.`);
      return;
    }
    if (!draft.summary) {
      setDraftError(`${rubric.summaryTitle}을(를) 선택하십시오.`);
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
        scores: draft.scores,
        summary: draft.summary,
        comment: draft.comment.trim(),
        evaluated_at: draft.date,
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
    setNotice(`${row.evaluated_at} ${rubric.label} 평가가 저장되었습니다.`);
    setDraft(emptyDraft(draft.kind));
    setTab('history');
  };

  const handleDeleteEvaluation = async (row: EvaluationRow) => {
    if (!window.confirm(`${row.evaluated_at} ${RUBRICS[row.kind].label} 평가를 삭제할까요?`)) return;
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
      .update({ name: pfName.trim(), school: pfSchool.trim() })
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
      className="w-20 shrink-0 bg-neutral-900 text-white flex flex-col items-center py-5 gap-3 sticky top-0 h-screen print:hidden"
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

  const copyButton = (student: Student, kind: LinkKind, compact = false) => (
    <button
      type="button"
      onClick={() => copyLink(student, kind)}
      className={`flex items-center gap-2 border-2 border-neutral-900 text-sm font-bold hover:bg-neutral-900 hover:text-white transition-colors ${
        compact ? 'px-3 py-1.5' : 'px-4 py-2'
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
    <aside className="border-b-2 lg:border-b-0 lg:border-r-2 border-neutral-900 p-8 space-y-10 print:hidden">
      <form onSubmit={handleAdd} className="space-y-3">
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
    </aside>
  );

  // ── 탭 1: 새 평가 입력 ──
  const renderNewEvaluation = (s: Student) => {
    const rubric = RUBRICS[draft.kind];
    return (
      <div className="space-y-10 print:hidden">
        <section className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-6 items-end">
          <div>
            <p className="text-sm font-semibold mb-3">평가 종류</p>
            <div className="grid grid-cols-2 border-2 border-neutral-900">
              {(['ojt', 'teacher'] as StaffKind[]).map((k, i) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={draft.kind === k}
                  onClick={() => changeDraftKind(k)}
                  className={`py-3 text-sm font-bold transition-colors ${i > 0 ? 'border-l-2 border-neutral-900' : ''} ${
                    draft.kind === k ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-100'
                  }`}
                >
                  {RUBRICS[k].label} 평가
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

        {draft.kind === 'teacher' && !TEACHER_TARGET_GRADES.includes(s.grade) && (
          <p className="text-sm border-l-4 border-neutral-900 pl-3 py-1">
            {s.name} 학생은 {s.grade}입니다. 교사 평가는 중학교와 고1~2 학생을 기준으로 설계되었습니다.
          </p>
        )}

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
          const sum = ids.reduce((acc, id) => acc + (draft.scores[id] ?? 0), 0);
          return (
            <section key={domain.key}>
              <div className="flex justify-between items-end border-b-4 border-neutral-900 pb-2 mb-1">
                <h3 className="text-lg font-bold">
                  {di + 1}. {domain.title}
                </h3>
                <p className="text-sm tabular-nums">
                  <span className="font-bold">{sum}</span> / {ids.length * rubric.max}점 ·{' '}
                  <span className="font-bold">{rateOf(draft.scores, ids, rubric.max)}%</span>
                </p>
              </div>
              <div className="divide-y divide-neutral-200">
                {domain.items.map((item) => (
                  <div key={item.id} className="flex flex-col md:flex-row md:items-center justify-between gap-3 py-4">
                    <p className="text-sm font-semibold">{item.label}</p>
                    <div className="grid grid-cols-4 gap-2 md:w-[420px]">
                      {rubric.scale.map((sc) => {
                        const active = draft.scores[item.id] === sc.value;
                        return (
                          <button
                            key={sc.value}
                            type="button"
                            aria-pressed={active}
                            onClick={() => setDraft({ ...draft, scores: { ...draft.scores, [item.id]: sc.value } })}
                            className={`border-2 py-2 text-center transition-colors ${
                              active ? 'bg-neutral-900 border-neutral-900 text-white' : 'border-neutral-300 text-neutral-600 hover:border-neutral-900'
                            }`}
                          >
                            <span className="block text-sm font-bold">{sc.value}</span>
                            <span className="block text-[11px]">{sc.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}

        <section>
          <h3 className="text-lg font-bold border-b-4 border-neutral-900 pb-2 mb-5">{rubric.domains.length + 1}. 종합 평가</h3>
          <p className="text-sm font-semibold mb-3">{rubric.summaryTitle}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-6">
            {rubric.summaryOptions.map((opt) => {
              const active = draft.summary === opt.value;
              return (
                <label
                  key={opt.value}
                  className={`flex items-center gap-3 border-2 px-4 py-3 cursor-pointer text-sm font-semibold transition-colors ${
                    active ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 hover:border-neutral-900'
                  }`}
                >
                  <input
                    type="radio"
                    name={`summary-${draft.kind}`}
                    value={opt.value}
                    checked={active}
                    onChange={() => setDraft({ ...draft, summary: opt.value })}
                    className="accent-neutral-900"
                  />
                  {opt.label}
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
            className="w-full h-40 border-2 border-neutral-300 p-4 text-sm leading-relaxed focus:outline-none focus:border-neutral-900"
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
            className="shrink-0 flex items-center justify-center gap-2 bg-neutral-900 text-white text-sm font-bold px-8 py-3 hover:bg-neutral-700 transition-colors disabled:opacity-60"
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-neutral-900 text-left">
                  <th className="py-3 pr-4 font-bold">평가일</th>
                  <th className="py-3 pr-4 font-bold">구분</th>
                  <th className="py-3 pr-4 font-bold text-right">종합</th>
                  <th className="py-3 pr-4 font-bold">영역별 달성률</th>
                  <th className="py-3 pr-4 font-bold">종합 판정</th>
                  <th className="py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {newestFirst.map((row) => {
                  const rubric = RUBRICS[row.kind];
                  return (
                    <tr key={row.id} className="align-top">
                      <td className="py-4 pr-4 tabular-nums whitespace-nowrap">{row.evaluated_at}</td>
                      <td className="py-4 pr-4 whitespace-nowrap font-semibold">{rubric.label}</td>
                      <td className="py-4 pr-4 text-right font-black tabular-nums">{overallRate(row)}%</td>
                      <td className="py-4 pr-4">
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600">
                          {rubric.domains.map((d) => (
                            <span key={d.key} className="whitespace-nowrap">
                              {d.title.replace(/\s*\(.*\)/, '')} <b className="text-neutral-900 tabular-nums">{domainRate(row, d)}%</b>
                            </span>
                          ))}
                        </div>
                        {row.evaluator && <p className="text-xs text-neutral-500 mt-2">평가자: {row.evaluator}</p>}
                        {row.comment && <p className="text-xs text-neutral-500 mt-2 line-clamp-2 whitespace-pre-line">{row.comment}</p>}
                      </td>
                      <td className="py-4 pr-4 whitespace-nowrap">{row.kind === 'self' ? '-' : optionLabel(row.kind, row.summary)}</td>
                      <td className="py-4">
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
        point[k] = row ? axisRate(row, axis) : 0;
      });
      return point;
    });

    const gapRows = INTEGRATED_AXES.map((axis) => {
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
      return { axis, v, note: notes.join(' / ') || '-' };
    });

    const performance = latest.ojt ? domainRate(latest.ojt, RUBRICS.ojt.domains[3]) : null;
    const cell = (n: number | null) => (n === null ? '-' : `${n}%`);

    return (
      <article className="max-w-[210mm] mx-auto bg-white border-2 border-neutral-900 p-10 print:max-w-none print:border-0 print:p-0 text-neutral-900">
        <header className="flex justify-between items-end border-b-4 border-neutral-900 pb-4">
          <div>
            <p className="text-xs text-neutral-500">3자 통합 직무 역량 인사이트 (고용주 · 교사 · 학생)</p>
            <h1 className="text-3xl font-black tracking-tight mt-1">{s.name}</h1>
          </div>
          <dl className="text-xs text-right space-y-0.5">
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

        <section className="grid grid-cols-3 border-b-2 border-neutral-900">
          {KINDS.map((k, i) => {
            const row = latest[k];
            return (
              <div key={k} className={`py-4 ${i === 0 ? 'pr-4' : 'px-4 border-l-2 border-neutral-900'}`}>
                <p className="text-xs text-neutral-500">
                  최신 {RUBRICS[k].label} {row ? `· ${row.evaluated_at}` : ''}
                </p>
                {row ? (
                  <>
                    <p className="text-3xl font-black tabular-nums mt-1">{overallRate(row)}%</p>
                    <p className="text-xs font-semibold mt-1">
                      {k === 'self' ? `${RUBRICS.self.max}점 척도 자기평가` : optionLabel(k, row.summary)}
                      {k === 'ojt' && performance !== null ? ` · 직무 성과 ${performance}%` : ''}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-neutral-400 mt-3">평가 기록 없음</p>
                )}
              </div>
            );
          })}
        </section>

        <section className="grid grid-cols-[300px_1fr] gap-6 py-5 border-b-2 border-neutral-900 break-inside-avoid">
          <div className="flex flex-col items-center">
            {present.length === 0 ? (
              <div className="w-[300px] h-[250px] flex items-center justify-center text-xs text-neutral-400">평가 기록이 없습니다.</div>
            ) : (
              <RadarChart width={300} height={250} data={radarData} outerRadius={88}>
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
              세 평가는 척도(4점·4점·3점)와 항목이 달라 의미가 같은 항목끼리 묶어 달성률로 환산했습니다. 고용주 평가의 직무 성과
              영역은 비교 대상이 없어 상단 고용주 칸에 따로 표시합니다. 학생 값이 다른 두 평가 평균보다 20%p 이상 차이 나면 인식
              차이로 표시합니다.
            </p>
          </div>
        </section>

        <section className="grid grid-cols-3 gap-5 py-5 border-b-2 border-neutral-900 break-inside-avoid">
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

        <footer className="grid grid-cols-3 gap-8 pt-8 text-xs">
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
      { key: 'insight', label: '통합 인사이트 (1-Page)', icon: <FileText size={16} /> },
    ];
    return (
      <>
        <div className="flex flex-wrap justify-between items-end gap-3 border-b-2 border-neutral-900 mb-8 print:hidden">
          <div className="flex flex-wrap">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-bold border-b-4 -mb-0.5 transition-colors ${
                  tab === t.key ? 'border-neutral-900 text-neutral-900' : 'border-transparent text-neutral-400 hover:text-neutral-900'
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 pb-3">
            <p className="text-sm">
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
                onClick={() => window.print()}
                className="flex items-center gap-2 border-2 border-neutral-900 px-4 py-2 text-sm font-bold hover:bg-neutral-900 hover:text-white transition-colors"
              >
                <Printer size={16} /> 인쇄
              </button>
            )}
          </div>
        </div>

        {tab === 'new' && renderNewEvaluation(selected)}
        {tab === 'history' && renderHistory(selected)}
        {/* 인사이트: 화면에서는 해당 탭일 때만, 인쇄 시에는 어느 탭에서든 이것만 출력 */}
        <div className={tab === 'insight' ? 'block' : 'hidden print:block'}>{renderInsight(selected)}</div>
      </>
    );
  };

  // ── 평가 링크 공유 화면 ──
  const renderShare = () => (
    <main className="p-8 print:hidden">
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
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-neutral-900 text-left">
                  <th className="py-3 pr-4 font-bold">학생</th>
                  <th className="py-3 pr-4 font-bold">사장님 평가 링크</th>
                  <th className="py-3 pr-4 font-bold">학생 자기평가 링크</th>
                  <th className="py-3 font-bold w-24" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {filteredStudents.map((s) => {
                  const lastOjt = latestOf(s.evaluations, 'ojt');
                  const lastSelf = latestOf(s.evaluations, 'self');
                  const linkCell = (kind: LinkKind, last: EvaluationRow | null) => (
                    <td className="py-4 pr-4">
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
                    <tr key={s.id} className="align-top">
                      <td className="py-4 pr-4">
                        <span className="font-bold">{s.name}</span>
                        <span className="text-neutral-500"> · {s.grade}</span>
                        <span className="block text-xs text-neutral-500 mt-0.5">
                          {s.mainField}
                          {s.site ? ` / ${s.site}` : ''}
                        </span>
                      </td>
                      {linkCell('ojt', lastOjt)}
                      {linkCell('self', lastSelf)}
                      <td className="py-4">
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
  const pendingCount = members.filter((m) => m.role === 'pending').length;

  const renderMembers = () => (
    <main className="p-8 print:hidden">
      <div className="max-w-5xl">
        <h2 className="text-lg font-bold border-b-4 border-neutral-900 pb-2 flex justify-between items-end">
          <span>회원 승인</span>
          <span className="text-sm font-normal text-neutral-500">승인 대기 {pendingCount}명</span>
        </h2>
        <p className="text-sm text-neutral-600 mt-4 leading-relaxed">
          이메일 인증을 마친 가입자가 표시됩니다. 연구회 선생님이 맞는지 확인한 뒤 승인하세요. 이 화면에서는 각 선생님의 학생
          정보가 보이지 않습니다.
        </p>
        {membersError && <p className="text-sm font-semibold border-l-4 border-neutral-900 pl-3 mt-4">{membersError}</p>}
        {membersLoading ? (
          <p className="text-sm text-neutral-500 py-8 flex items-center gap-2">
            <Loader2 size={16} className="animate-spin" /> 불러오는 중...
          </p>
        ) : (
          <div className="overflow-x-auto mt-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-neutral-900 text-left">
                  <th className="py-3 pr-4 font-bold">이름</th>
                  <th className="py-3 pr-4 font-bold">소속 학교</th>
                  <th className="py-3 pr-4 font-bold">이메일</th>
                  <th className="py-3 pr-4 font-bold">가입일</th>
                  <th className="py-3 pr-4 font-bold">상태</th>
                  <th className="py-3 font-bold w-28" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {members.map((m) => (
                  <tr key={m.id}>
                    <td className="py-4 pr-4 font-bold">{m.name || '-'}</td>
                    <td className="py-4 pr-4">{m.school || '-'}</td>
                    <td className="py-4 pr-4 text-neutral-600">{m.email}</td>
                    <td className="py-4 pr-4 tabular-nums text-neutral-600">{m.created_at.slice(0, 10)}</td>
                    <td className="py-4 pr-4">
                      <span className={m.role === 'pending' ? 'font-bold' : 'text-neutral-600'}>{ROLE_LABEL[m.role]}</span>
                    </td>
                    <td className="py-4">
                      {m.role === 'pending' && (
                        <button
                          type="button"
                          onClick={() => changeRole(m, 'teacher')}
                          className="flex items-center gap-1.5 bg-neutral-900 text-white px-3 py-1.5 text-xs font-bold hover:bg-neutral-700"
                        >
                          <Check size={13} /> 승인
                        </button>
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
  const totalEvaluations = students.reduce((sum, s) => sum + s.evaluations.length, 0);
  const msgLine = (m: FormMessage | null) =>
    m ? (
      <p className={`text-xs border-l-4 pl-2 py-0.5 ${m.type === 'error' ? 'border-neutral-900 font-semibold' : 'border-neutral-400 text-neutral-700'}`}>
        {m.text}
      </p>
    ) : null;

  const renderProfile = () => (
    <main className="p-8 print:hidden">
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
                  탈퇴하면 계정과 함께 <b>등록한 학생 {students.length}명, 평가 기록 {totalEvaluations}건</b>이 모두 삭제되며 되돌릴 수
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
      <div className="flex-1 min-w-0">
        <header className="border-b-4 border-neutral-900 px-8 py-5 flex justify-between items-end gap-4 print:hidden">
          <div>
            <h1 className="text-2xl font-black tracking-tighter">Link-路 <span className="font-bold text-neutral-500">나라T 직업교육 Lab</span></h1>
            <p className="text-sm text-neutral-500 mt-1">{HEADER_DESC[nav]}</p>
          </div>
          <div className="text-right text-xs">
            <p className="font-bold text-sm">
              {profile.name || profile.email} <span className="font-normal text-neutral-500">{ROLE_LABEL[profile.role]}</span>
            </p>
            <p className="text-neutral-500 mt-0.5">{profile.school}</p>
            <p className="text-[11px] text-neutral-500 mt-1 flex items-center justify-end gap-1.5">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${liveStatus === 'live' ? 'bg-neutral-900' : 'bg-neutral-300'}`} />
              {liveStatus === 'live' ? '실시간 반영 중' : liveStatus === 'connecting' ? '연결 중' : '연결 끊김 · 새로고침 필요'}
            </p>
          </div>
        </header>
        {nav === 'dashboard' ? (
          <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] print:block">
            {renderSidebar()}
            <main className="p-8 min-w-0 print:p-0">{renderDetail()}</main>
          </div>
        ) : nav === 'share' ? (
          renderShare()
        ) : nav === 'members' ? (
          renderMembers()
        ) : (
          renderProfile()
        )}
      </div>

      {arrivals.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 w-80 space-y-2 print:hidden" role="status" aria-live="polite">
          {arrivals.map((a) => (
            <div key={a.id} className="bg-neutral-900 text-white p-4 shadow-lg">
              <div className="flex justify-between items-start gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] text-neutral-400">새 평가 도착</p>
                  <p className="text-sm font-bold mt-0.5 truncate">
                    {a.studentName} · {RUBRICS[a.kind].label}
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