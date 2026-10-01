import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { createClient } from '@supabase/supabase-js';
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
const EVAL_COLUMNS = 'id, student_id, kind, scores, summary, comment, evaluated_at, created_at';

// ─────────────────────────────────────────────
// 1. 타입
// ─────────────────────────────────────────────
type Kind = 'ojt' | 'teacher' | 'self';
type StaffKind = 'ojt' | 'teacher';
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
  evaluated_at: string;
  created_at: string;
};

type Student = {
  id: string;
  name: string;
  grade: string;
  mainField: string;
  site: string;
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
const selfLink = (studentId: string) =>
  `${window.location.origin}${window.location.pathname}?view=self&id=${encodeURIComponent(studentId)}`;

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
// 4. 라우팅: ?view=self&id=학생ID → 학생 자기평가 화면
// ─────────────────────────────────────────────
export default function App() {
  const params = new URLSearchParams(window.location.search);
  const selfId = params.get('view') === 'self' ? params.get('id') : null;
  return (
    <>
      <style>{PRINT_CSS}</style>
      {selfId ? <SelfAssessmentPage studentId={selfId} /> : <TeacherApp />}
    </>
  );
}

// ─────────────────────────────────────────────
// 5. 학생 자기평가 화면 (공유 링크 전용)
// ─────────────────────────────────────────────
function SelfAssessmentPage({ studentId }: { studentId: string }) {
  const rubric = RUBRICS.self;
  const [studentName, setStudentName] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from(STUDENTS_TABLE).select('name').eq('id', studentId).maybeSingle();
      if (cancelled) return;
      if (error || !data) setLoadError('링크가 올바르지 않습니다. 선생님께 새 링크를 받아 주세요.');
      else setStudentName((data as { name: string }).name);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  const items = allItems(rubric);
  const answered = items.filter((i) => scores[i.id] != null).length;

  const handleSubmit = async () => {
    if (answered < items.length) {
      setSubmitError(`아직 고르지 않은 질문이 ${items.length - answered}개 있어요.`);
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    const { error } = await supabase.from(EVALUATIONS_TABLE).insert({
      student_id: studentId,
      kind: 'self',
      scores,
      summary: null,
      comment: comment.trim(),
      evaluated_at: today(),
    });
    setSubmitting(false);
    if (error) {
      setSubmitError('제출하지 못했어요. 잠시 후 다시 눌러 주세요.');
      return;
    }
    setDone(true);
    window.scrollTo({ top: 0 });
  };

  const shell = (children: ReactNode) => (
    <div className="min-h-screen bg-white text-neutral-900 font-sans">
      <header className="border-b-4 border-neutral-900 px-6 py-4">
        <p className="text-lg font-black tracking-tighter">나라T 직업교육lab</p>
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
  if (loadError) return shell(<p className="text-lg font-bold border-l-4 border-neutral-900 pl-4">{loadError}</p>);
  if (done)
    return shell(
      <div className="border-2 border-neutral-900 p-10 text-center space-y-4">
        <Check size={48} className="mx-auto" strokeWidth={3} />
        <p className="text-2xl font-black">제출했어요</p>
        <p className="text-lg">{studentName}님, 수고했어요. 선생님이 확인할 거예요.</p>
      </div>
    );

  return shell(
    <div className="space-y-12">
      <div>
        <h1 className="text-3xl font-black tracking-tight">{studentName}님의 자기평가</h1>
        <p className="text-lg text-neutral-600 mt-3 leading-relaxed">
          요즘 일할 때 나의 모습을 생각하며, 질문마다 하나씩 골라 주세요.
        </p>
      </div>

      {rubric.domains.map((domain, di) => (
        <section key={domain.key}>
          <h2 className="text-xl font-bold border-b-4 border-neutral-900 pb-2 mb-2">
            {di + 1}. {domain.title}
          </h2>
          <div className="divide-y divide-neutral-200">
            {domain.items.map((item) => (
              <div key={item.id} className="py-6">
                <p className="text-lg font-semibold mb-4 leading-relaxed">{item.prompt}</p>
                <div className="grid grid-cols-3 gap-3">
                  {rubric.scale.map((sc) => {
                    const active = scores[item.id] === sc.value;
                    return (
                      <button
                        key={sc.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setScores((prev) => ({ ...prev, [item.id]: sc.value }))}
                        className={`border-2 py-4 transition-colors ${
                          active ? 'bg-neutral-900 border-neutral-900 text-white' : 'border-neutral-300 hover:border-neutral-900'
                        }`}
                      >
                        <span className="block text-xl font-black">{sc.label}</span>
                        <span className={`block text-sm mt-1 ${active ? 'text-neutral-300' : 'text-neutral-500'}`}>{sc.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      <section>
        <label htmlFor="self-comment" className="block text-xl font-bold border-b-4 border-neutral-900 pb-2 mb-4">
          {rubric.commentTitle}
        </label>
        <textarea
          id="self-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={rubric.commentPlaceholder}
          className="w-full h-32 border-2 border-neutral-300 p-4 text-lg focus:outline-none focus:border-neutral-900"
        />
      </section>

      <div className="space-y-3">
        <p className="text-base text-neutral-600">
          {answered} / {items.length}개 골랐어요
        </p>
        {submitError && <p className="text-lg font-bold border-l-4 border-neutral-900 pl-3">{submitError}</p>}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full bg-neutral-900 text-white text-xl font-black py-5 flex items-center justify-center gap-2 hover:bg-neutral-700 transition-colors disabled:opacity-60"
        >
          {submitting ? <Loader2 size={22} className="animate-spin" /> : <Check size={22} strokeWidth={3} />}
          {submitting ? '보내는 중...' : '제출하기'}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 6. 교사용 앱
// ─────────────────────────────────────────────
type NavView = 'dashboard' | 'share';
type Tab = 'new' | 'history' | 'insight';

function TeacherApp() {
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
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const selected = students.find((s) => s.id === selectedId) ?? null;

  // ── 불러오기 ──
  const fetchStudents = useCallback(async () => {
    setLoadError('');
    const { data, error } = await supabase
      .from(STUDENTS_TABLE)
      .select(`id, name, grade, main_field, site, created_at, ${EVALUATIONS_TABLE}(${EVAL_COLUMNS})`)
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

  const fieldOptions = useMemo(
    () => Array.from(new Set([...FIELD_SUGGESTIONS, ...students.map((s) => s.mainField)])).filter(Boolean),
    [students]
  );

  const selectStudent = (id: string) => {
    setSelectedId(id);
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
      .select('id, name, grade, main_field, site, created_at')
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
    if (error || !data) {
      setDraftError(`저장하지 못했습니다: ${error?.message ?? '알 수 없는 오류'}`);
      return;
    }
    const row = normalizeEval(data as unknown as RawEvaluationRow);
    setStudents((prev) =>
      prev.map((s) => (s.id === selected.id ? { ...s, evaluations: [...s.evaluations, row].sort(byTimeAsc) } : s))
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

  // ── 자기평가 링크 복사 ──
  const copyLink = async (student: Student) => {
    const url = selfLink(student.id);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(student.id);
      window.setTimeout(() => setCopiedId((id) => (id === student.id ? null : id)), 2000);
    } catch {
      window.prompt('아래 링크를 복사해 학생에게 보내 주세요.', url);
    }
  };

  // ─────────────────────────────────────────
  // 화면 조각
  // ─────────────────────────────────────────
  const navItems: { key: NavView; label: string; icon: ReactNode }[] = [
    { key: 'dashboard', label: '학생 대시보드', icon: <LayoutDashboard size={20} /> },
    { key: 'share', label: '자기평가 공유', icon: <Share2 size={20} /> },
  ];

  const renderNav = () => (
    <nav
      aria-label="주요 메뉴"
      className="w-20 shrink-0 bg-neutral-900 text-white flex flex-col items-center py-5 gap-3 sticky top-0 h-screen print:hidden"
    >
      <div className="w-11 h-11 border-2 border-white flex items-center justify-center font-black text-lg mb-4">T</div>
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
    </nav>
  );

  const copyButton = (student: Student, compact = false) => (
    <button
      type="button"
      onClick={() => copyLink(student)}
      className={`flex items-center gap-2 border-2 border-neutral-900 text-sm font-bold hover:bg-neutral-900 hover:text-white transition-colors ${
        compact ? 'px-3 py-1.5' : 'px-4 py-2'
      }`}
    >
      {copiedId === student.id ? <Check size={15} /> : <Copy size={15} />}
      {copiedId === student.id ? '복사됨' : '자기평가 링크'}
    </button>
  );

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
          <span className="font-normal text-neutral-500">{students.length}명</span>
        </h2>
        {loading ? (
          <p className="text-sm text-neutral-500 py-6 flex items-center gap-2">
            <Loader2 size={16} className="animate-spin" /> 불러오는 중...
          </p>
        ) : students.length === 0 ? (
          <p className="text-sm text-neutral-500 py-6">등록된 학생이 없습니다. 위 양식에서 추가하세요.</p>
        ) : (
          <ul className="divide-y divide-neutral-200">
            {students.map((s) => {
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
            })}
          </ul>
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
          <div className="flex items-center gap-3 pb-3">
            <p className="text-sm">
              <span className="font-bold">{selected.name}</span>
              <span className="text-neutral-500">
                {' '}
                · {selected.grade} · {selected.mainField}
              </span>
            </p>
            {copyButton(selected)}
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

  // ── 자기평가 공유 화면 ──
  const renderShare = () => (
    <main className="p-8 print:hidden">
      <div className="max-w-4xl">
        <h2 className="text-lg font-bold border-b-4 border-neutral-900 pb-2">학생 자기평가 링크</h2>
        <p className="text-sm text-neutral-600 mt-4 leading-relaxed">
          링크를 복사해 학생에게 보내면, 학생은 로그인 없이 3점 척도 자기평가를 제출할 수 있습니다. 제출할 때마다 새 기록으로
          누적되며 통합 인사이트에 바로 반영됩니다.
        </p>
        {loading ? (
          <p className="text-sm text-neutral-500 py-8 flex items-center gap-2">
            <Loader2 size={16} className="animate-spin" /> 불러오는 중...
          </p>
        ) : students.length === 0 ? (
          <p className="text-sm text-neutral-500 py-8">등록된 학생이 없습니다. 학생 대시보드에서 먼저 학생을 추가하세요.</p>
        ) : (
          <table className="w-full text-sm mt-6">
            <thead>
              <tr className="border-b-2 border-neutral-900 text-left">
                <th className="py-3 pr-4 font-bold">학생</th>
                <th className="py-3 pr-4 font-bold">최근 자기평가</th>
                <th className="py-3 pr-4 font-bold">링크</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {students.map((s) => {
                const last = latestOf(s.evaluations, 'self');
                return (
                  <tr key={s.id}>
                    <td className="py-4 pr-4">
                      <span className="font-bold">{s.name}</span>
                      <span className="text-neutral-500"> · {s.grade}</span>
                    </td>
                    <td className="py-4 pr-4 tabular-nums">{last ? `${last.evaluated_at} · ${overallRate(last)}%` : '미제출'}</td>
                    <td className="py-4 pr-4">
                      <div className="flex items-center gap-3">
                        {copyButton(s, true)}
                        <a href={selfLink(s.id)} target="_blank" rel="noreferrer" className="text-sm underline text-neutral-600 hover:text-neutral-900">
                          열기
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );

  return (
    <div className="min-h-screen flex bg-white text-neutral-900 font-sans print:block">
      {renderNav()}
      <div className="flex-1 min-w-0">
        <header className="border-b-4 border-neutral-900 px-8 py-5 print:hidden">
          <h1 className="text-2xl font-black tracking-tighter">나라T 직업교육lab</h1>
          <p className="text-sm text-neutral-500 mt-1">
            {nav === 'dashboard' ? '학생 대시보드 · 고용주 · 교사 · 학생 3자 평가 통합 관리' : '자기평가 공유 · 학생용 링크 관리'}
          </p>
        </header>
        {nav === 'dashboard' ? (
          <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] print:block">
            {renderSidebar()}
            <main className="p-8 min-w-0 print:p-0">{renderDetail()}</main>
          </div>
        ) : (
          renderShare()
        )}
      </div>
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