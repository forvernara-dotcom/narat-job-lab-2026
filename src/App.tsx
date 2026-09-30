import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Search, Share2, CheckCircle, Plus, Pencil, X, Loader2 } from 'lucide-react';

// ─────────────────────────────────────────────
// Supabase 설정: 발급받은 URL과 Key가 주입된 완성 상태
// ─────────────────────────────────────────────
const SUPABASE_URL = 'https://rvhnvvszispxyrjdihqj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2aG52dnN6aXNweHlyamRpaHFqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3ODEyMDMsImV4cCI6MjEwNjM1NzIwM30.1M4yy-NQ6k2ZuUJRz6pcl1JLdn8NC-1kIubfXvpknJQ';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const OJT_SITES = ['제과제빵 보조직무', '레스토랑 다정', '더불어삶'];

const AREAS = [
  { key: 'attitude', label: '태도 (출결, 성실성)' },
  { key: 'job', label: '직무 (업무 이해도)' },
  { key: 'communication', label: '소통 (지시 이행)' },
];

const EMPTY_SCORES = { attitude: null, job: null, communication: null };
const EMPTY_STUDENT_FORM = {
  name: '',
  main_field: '',
  program_name: '',
  modules: '',
  ojt_company: OJT_SITES[0],
};

// 가장 최근 평가 1건
const getLatestEval = (student) => {
  const evals = student.ojt_evaluations || [];
  if (evals.length === 0) return null;
  return [...evals].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
};

// 차트와 표가 함께 쓰는 단일 점수 기준: 최근 평가의 3개 영역 평균
const getAverage = (evaluation) =>
  evaluation
    ? Number(((evaluation.attitude + evaluation.job + evaluation.communication) / 3).toFixed(1))
    : null;

export default function TransitionEduSaaS() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [viewMode, setViewMode] = useState('teacher'); // 'teacher' | 'employer'
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // 사업체 평가서 상태
  const [scores, setScores] = useState(EMPTY_SCORES);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState({ type: '', text: '' });

  // 학생 추가/수정 모달 상태
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [studentForm, setStudentForm] = useState(EMPTY_STUDENT_FORM);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  // ── 데이터 불러오기 ──
  const fetchStudents = useCallback(async () => {
    setLoadError('');
    const { data, error } = await supabase
      .from('students')
      .select(
        'id, name, main_field, program_name, modules, ojt_company, created_at, ojt_evaluations(id, attitude, job, communication, comment, created_at)'
      )
      .order('created_at', { ascending: true });

    if (error) {
      setLoadError(`학생 데이터를 불러오지 못했습니다: ${error.message}`);
    } else {
      setStudents(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const selectedStudent = students.find((s) => s.id === selectedStudentId) || null;

  const filteredStudents = useMemo(() => {
    const term = searchTerm.trim();
    if (!term) return students;
    return students.filter((s) => s.name.includes(term));
  }, [students, searchTerm]);

  const chartData = students.map((s) => ({
    name: s.name,
    평균점수: getAverage(getLatestEval(s)) ?? 0,
  }));

  // ── 평가서 제출 ──
  const resetEvaluationForm = () => {
    setScores(EMPTY_SCORES);
    setComment('');
  };

  const handleSubmitEvaluation = async () => {
    setSubmitMessage({ type: '', text: '' });
    if (!selectedStudent) {
      setSubmitMessage({ type: 'error', text: '평가할 학생을 선택해 주십시오.' });
      return;
    }
    if (Object.values(scores).some((v) => v === null)) {
      setSubmitMessage({ type: 'error', text: '태도, 직무, 소통 세 영역 모두 점수를 선택해 주십시오.' });
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.from('ojt_evaluations').insert({
      student_id: selectedStudent.id,
      attitude: scores.attitude,
      job: scores.job,
      communication: scores.communication,
      comment: comment.trim() || null,
    });
    setSubmitting(false);

    if (error) {
      setSubmitMessage({ type: 'error', text: `제출에 실패했습니다: ${error.message}` });
      return;
    }
    setSubmitMessage({ type: 'success', text: `${selectedStudent.name} 학생의 평가가 제출되었습니다.` });
    resetEvaluationForm();
    fetchStudents();
  };

  const openEmployerView = () => {
    if (!selectedStudentId && students.length > 0) setSelectedStudentId(students[0].id);
    resetEvaluationForm();
    setSubmitMessage({ type: '', text: '' });
    setViewMode('employer');
  };

  // ── 학생 추가/수정 ──
  const openAddModal = () => {
    setEditingId(null);
    setStudentForm(EMPTY_STUDENT_FORM);
    setModalError('');
    setModalOpen(true);
  };

  const openEditModal = (student) => {
    setEditingId(student.id);
    setStudentForm({
      name: student.name || '',
      main_field: student.main_field || '',
      program_name: student.program_name || '',
      modules: (student.modules || []).join(', '),
      ojt_company: student.ojt_company || OJT_SITES[0],
    });
    setModalError('');
    setModalOpen(true);
  };

  const handleSaveStudent = async () => {
    if (!studentForm.name.trim()) {
      setModalError('학생 이름을 입력해 주십시오.');
      return;
    }
    setSaving(true);
    setModalError('');

    const payload = {
      name: studentForm.name.trim(),
      main_field: studentForm.main_field.trim() || null,
      program_name: studentForm.program_name.trim() || null,
      modules: studentForm.modules
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean),
      ojt_company: studentForm.ojt_company,
    };

    const { error } = editingId
      ? await supabase.from('students').update(payload).eq('id', editingId)
      : await supabase.from('students').insert(payload);

    setSaving(false);
    if (error) {
      setModalError(`저장에 실패했습니다: ${error.message}`);
      return;
    }
    setModalOpen(false);
    fetchStudents();
  };

  const updateField = (field) => (e) => setStudentForm((prev) => ({ ...prev, [field]: e.target.value }));

  // ─────────────────────────────────────────────
  // 사업체 평가서
  // ─────────────────────────────────────────────
  const renderEmployerForm = () => (
    <div className="max-w-md mx-auto bg-white p-6 border-t-4 border-gray-900 shadow-sm mt-8">
      <h2 className="text-xl font-bold mb-2 tracking-tight">OJT 현장 평가서</h2>
      <p className="text-sm text-gray-500 mb-6">현장 실습생의 직무 수행 수준을 4점 척도로 평가해 주십시오.</p>

      <div className="space-y-6">
        <div className="border-b pb-4">
          <label className="block text-sm font-semibold text-gray-700 mb-3">평가 대상 학생</label>
          <select
            value={selectedStudentId || ''}
            onChange={(e) => {
              setSelectedStudentId(e.target.value || null);
              setSubmitMessage({ type: '', text: '' });
            }}
            className="w-full border border-gray-300 p-2 text-sm focus:outline-none focus:border-gray-900 bg-white"
          >
            <option value="">학생을 선택하세요</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.ojt_company || '실습처 미배정'})
              </option>
            ))}
          </select>
          {selectedStudent && (
            <p className="text-xs text-gray-500 mt-2">
              실습처: {selectedStudent.ojt_company || '미배정'} / 주전공: {selectedStudent.main_field || '-'}
            </p>
          )}
        </div>

        {AREAS.map((area) => (
          <div key={area.key} className="border-b pb-4">
            <label className="block text-sm font-semibold text-gray-700 mb-3">{area.label}</label>
            <div className="flex justify-between gap-2">
              {[1, 2, 3, 4].map((score) => {
                const active = scores[area.key] === score;
                return (
                  <button
                    key={score}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setScores((prev) => ({ ...prev, [area.key]: score }))}
                    className={`w-full py-2 border transition-colors text-sm font-medium ${
                      active
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-900 hover:text-white'
                    }`}
                  >
                    {score}점
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">종합 의견</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="w-full border border-gray-300 p-3 text-sm focus:outline-none focus:border-gray-900 h-24"
            placeholder="학생의 현장 강점과 보완점을 간략히 적어주세요."
          />
        </div>

        {submitMessage.text && (
          <p
            className={`text-sm border-l-4 pl-3 py-1 ${
              submitMessage.type === 'error' ? 'border-gray-900 text-gray-900 font-semibold' : 'border-gray-400 text-gray-600'
            }`}
          >
            {submitMessage.text}
          </p>
        )}

        <button
          type="button"
          onClick={handleSubmitEvaluation}
          disabled={submitting}
          className="w-full bg-gray-900 text-white font-bold py-3 mt-4 flex items-center justify-center gap-2 hover:bg-gray-800 transition-colors disabled:opacity-60"
        >
          {submitting ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
          {submitting ? '제출 중...' : '평가 제출하기'}
        </button>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────
  // 학생 추가/수정 모달
  // ─────────────────────────────────────────────
  const renderStudentModal = () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 p-4">
      <div className="w-full max-w-md bg-white p-6 border-t-4 border-gray-900 shadow-sm">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-xl font-bold tracking-tight">{editingId ? '학생 정보 수정' : '학생 추가'}</h2>
            <p className="text-sm text-gray-500 mt-1">교내 훈련 정보와 OJT 실습처를 지정합니다.</p>
          </div>
          <button type="button" onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-900" aria-label="닫기">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          {[
            { field: 'name', label: '이름', placeholder: '예: 김민수' },
            { field: 'main_field', label: '주전공', placeholder: '예: 제과제빵' },
            { field: 'program_name', label: '교내 훈련 프로그램', placeholder: '예: 교내 제과 실습' },
            { field: 'modules', label: '훈련 모듈 (쉼표로 구분)', placeholder: '예: 계량, 반죽, 포장' },
          ].map(({ field, label, placeholder }) => (
            <div key={field}>
              <label className="block text-sm font-semibold text-gray-700 mb-2">{label}</label>
              <input
                type="text"
                value={studentForm[field]}
                onChange={updateField(field)}
                placeholder={placeholder}
                className="w-full border border-gray-300 p-2 text-sm focus:outline-none focus:border-gray-900"
              />
            </div>
          ))}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">OJT 실습처 배정</label>
            <div className="grid grid-cols-1 gap-2">
              {OJT_SITES.map((site) => {
                const active = studentForm.ojt_company === site;
                return (
                  <button
                    key={site}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setStudentForm((prev) => ({ ...prev, ojt_company: site }))}
                    className={`w-full py-2 px-3 border text-left text-sm font-medium transition-colors ${
                      active ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {site}
                  </button>
                );
              })}
            </div>
          </div>

          {modalError && <p className="text-sm border-l-4 border-gray-900 pl-3 py-1 font-semibold">{modalError}</p>}

          <button
            type="button"
            onClick={handleSaveStudent}
            disabled={saving}
            className="w-full bg-gray-900 text-white font-bold py-3 mt-2 flex items-center justify-center gap-2 hover:bg-gray-800 transition-colors disabled:opacity-60"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
            {saving ? '저장 중...' : editingId ? '수정 내용 저장' : '학생 추가하기'}
          </button>
        </div>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────
  // 교사 대시보드
  // ─────────────────────────────────────────────
  const renderTeacherDashboard = () => (
    <div className="space-y-8">
      {loadError && (
        <div className="bg-white border border-gray-900 p-4 text-sm flex justify-between items-center">
          <span className="font-semibold">{loadError}</span>
          <button type="button" onClick={fetchStudents} className="underline text-gray-600 hover:text-gray-900">
            다시 불러오기
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 border border-gray-200">
          <h3 className="text-sm font-bold text-gray-500 mb-4 uppercase tracking-wider">학생별 OJT 성취도 (최근 평가 평균)</h3>
          <div className="h-64">
            {students.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-gray-400">
                {loading ? '불러오는 중...' : '학생을 추가하면 성취도가 표시됩니다.'}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={12} />
                  <YAxis domain={[0, 4]} axisLine={false} tickLine={false} fontSize={12} />
                  <Tooltip cursor={{ fill: '#f3f4f6' }} />
                  <Bar dataKey="평균점수" fill="#111827" radius={[2, 2, 0, 0]} barSize={32} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-white p-6 border border-gray-200 flex flex-col justify-center items-center text-center">
          <h3 className="text-sm font-bold text-gray-500 mb-2 uppercase tracking-wider">총 관리 학생</h3>
          <p className="text-5xl font-black text-gray-900">{students.length}명</p>
          {selectedStudent && <p className="text-xs text-gray-500 mt-3">선택된 학생: {selectedStudent.name}</p>}
          <button
            type="button"
            className="mt-6 flex items-center gap-2 text-sm text-gray-600 border border-gray-300 px-4 py-2 hover:bg-gray-50 transition-colors disabled:opacity-50"
            onClick={openEmployerView}
            disabled={students.length === 0}
          >
            <Share2 size={16} /> 평가 링크 시뮬레이션
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 gap-3 flex-wrap">
          <h3 className="text-sm font-bold text-gray-900">진로직업전환 학생 목록</h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="학생 이름 검색..."
                className="pl-9 pr-4 py-2 text-sm border border-gray-300 focus:outline-none focus:border-gray-900 w-64"
              />
            </div>
            <button
              type="button"
              onClick={openAddModal}
              className="flex items-center gap-1 bg-gray-900 text-white text-sm font-bold px-4 py-2 hover:bg-gray-800 transition-colors"
            >
              <Plus size={16} /> 학생 추가
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-gray-500 uppercase tracking-wider bg-white">
                <th className="p-4 font-semibold">이름</th>
                <th className="p-4 font-semibold">주전공</th>
                <th className="p-4 font-semibold">교내 훈련</th>
                <th className="p-4 font-semibold">현장 실습처</th>
                <th className="p-4 font-semibold">OJT 성취도</th>
                <th className="p-4 font-semibold">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-400">
                    <Loader2 size={18} className="animate-spin inline mr-2" /> 불러오는 중...
                  </td>
                </tr>
              )}
              {!loading && filteredStudents.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-400">
                    {searchTerm ? `'${searchTerm}'에 해당하는 학생이 없습니다.` : '등록된 학생이 없습니다. 학생 추가 버튼으로 시작하세요.'}
                  </td>
                </tr>
              )}
              {!loading &&
                filteredStudents.map((student) => {
                  const avg = getAverage(getLatestEval(student));
                  const isSelected = student.id === selectedStudentId;
                  return (
                    <tr
                      key={student.id}
                      onClick={() => setSelectedStudentId(student.id)}
                      className={`cursor-pointer transition-colors ${isSelected ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
                    >
                      <td className={`p-4 font-medium text-gray-900 ${isSelected ? 'border-l-4 border-gray-900' : ''}`}>
                        {student.name}
                      </td>
                      <td className="p-4 text-gray-600">{student.main_field || '-'}</td>
                      <td className="p-4 text-gray-600">{student.program_name || '-'}</td>
                      <td className="p-4 text-gray-600">{student.ojt_company || '미배정'}</td>
                      <td className="p-4 text-gray-900 font-bold">{avg !== null ? `${avg} / 4` : '-'}</td>
                      <td className="p-4">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditModal(student);
                          }}
                          className="flex items-center gap-1 text-sm text-gray-600 border border-gray-300 px-3 py-1 hover:bg-gray-50 transition-colors"
                        >
                          <Pencil size={14} /> 수정
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8 flex justify-between items-end border-b border-gray-200 pb-4">
          <div>
            <h1 className="text-2xl font-black tracking-tighter">나라T 직업교육lab</h1>
            <p className="text-sm text-gray-500 mt-1">Transition Education SaaS</p>
          </div>
          {viewMode === 'employer' && (
            <button
              type="button"
              onClick={() => setViewMode('teacher')}
              className="text-sm text-gray-500 underline hover:text-gray-900"
            >
              교사 대시보드로 돌아가기
            </button>
          )}
        </header>
        {viewMode === 'teacher' ? renderTeacherDashboard() : renderEmployerForm()}
      </div>
      {modalOpen && renderStudentModal()}
    </div>
  );
}