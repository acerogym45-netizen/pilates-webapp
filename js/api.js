/**
 * API 헬퍼 - /api/ 엔드포인트 래퍼
 * 관리자 페이지 및 프론트엔드에서 공통 사용
 */
const API = (() => {
    const BASE = '/api';

    // 공통 fetch 유틸리티
    async function req(method, path, body) {
        const opts = {
            method,
            headers: { 'Content-Type': 'application/json' }
        };
        if (body !== undefined) opts.body = JSON.stringify(body);
        const res = await fetch(BASE + path, opts);
        const data = await res.json();
        if (!res.ok || data.success === false) {
            throw new Error(data.error || `HTTP ${res.status}`);
        }
        return data;
    }

    function qs(params) {
        if (!params) return '';
        const p = Object.fromEntries(
            Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
        );
        const s = new URLSearchParams(p).toString();
        return s ? '?' + s : '';
    }

    return {
        // ─── 단지 ───────────────────────────────────────
        complexes: {
            list:           (p)      => req('GET',  `/complexes${qs(p)}`),
            get:            (id)     => req('GET',  `/complexes/${id}`),
            byCode:         (code)   => req('GET',  `/complexes/by-code/${code}`),
            create:         (data)   => req('POST', '/complexes', data),
            update:         (id, d)  => req('PUT',  `/complexes/${id}`, d),
            delete:         (id)     => req('DELETE',`/complexes/${id}`),
            verifyPassword: (code, pw) => req('POST', '/complexes/verify-password', { complexCode: code, password: pw }),
        },

        // ─── 프로그램 ────────────────────────────────────
        programs: {
            list:     (p)     => req('GET',  `/programs${qs(p)}`),
            get:      (id)    => req('GET',  `/programs/${id}`),
            create:   (data)  => req('POST', '/programs', data),
            update:   (id, d) => req('PUT',  `/programs/${id}`, d),
            delete:   (id)    => req('DELETE',`/programs/${id}`),
            capacity: (id)    => req('GET',  `/programs/${id}/capacity`),
        },

        // ─── 신청 ────────────────────────────────────────
        applications: {
            list:     (p)     => req('GET',  `/applications${qs(p)}`),
            get:      (id)    => req('GET',  `/applications/${id}`),
            my:       (p)     => req('GET',  `/applications/my${qs(p)}`),
            create:   (data)  => req('POST', '/applications', data),
            update:   (id, d) => req('PUT',  `/applications/${id}`, d),
            delete:   (id)    => req('DELETE',`/applications/${id}`),
            transfer: (id, d) => req('POST', `/applications/${id}/transfer`, d),
            feeCalc:  (d)     => req('POST', '/applications/fee-calc', d),
        },

        // ─── 해지 ────────────────────────────────────────
        cancellations: {
            list:   (p)     => req('GET',  `/cancellations${qs(p)}`),
            get:    (id)    => req('GET',  `/cancellations/${id}`),
            create: (data)  => req('POST', '/cancellations', data),
            update: (id, d) => req('PUT',  `/cancellations/${id}`, d),
            delete: (id)    => req('DELETE',`/cancellations/${id}`),
        },

        // ─── 공지사항 ────────────────────────────────────
        notices: {
            list:   (p)     => req('GET',  `/notices${qs(p)}`),
            get:    (id)    => req('GET',  `/notices/${id}`),
            create: (data)  => req('POST', '/notices', data),
            update: (id, d) => req('PUT',  `/notices/${id}`, d),
            delete: (id)    => req('DELETE',`/notices/${id}`),
        },

        // ─── 문의 ────────────────────────────────────────
        inquiries: {
            list:   (p)     => req('GET',  `/inquiries${qs(p)}`),
            get:    (id)    => req('GET',  `/inquiries/${id}`),
            create: (data)  => req('POST', '/inquiries', data),
            update: (id, d) => req('PUT',  `/inquiries/${id}`, d),
            delete: (id)    => req('DELETE',`/inquiries/${id}`),
        },

        // ─── 강사 ────────────────────────────────────────
        instructors: {
            list:   (p)     => req('GET',  `/instructors${qs(p)}`),
            get:    (id)    => req('GET',  `/instructors/${id}`),
            create: (data)  => req('POST', '/instructors', data),
            update: (id, d) => req('PUT',  `/instructors/${id}`, d),
            delete: (id)    => req('DELETE',`/instructors/${id}`),
        },

        // ─── 커리큘럼 ────────────────────────────────────
        curricula: {
            list:   (p)     => req('GET',  `/curricula${qs(p)}`),
            get:    (id)    => req('GET',  `/curricula/${id}`),
            create: (data)  => req('POST', '/curricula', data),
            update: (id, d) => req('PUT',  `/curricula/${id}`, d),
            delete: (id)    => req('DELETE',`/curricula/${id}`),
        },

        // ─── 통계 ────────────────────────────────────────
        stats: {
            dashboard: (p)  => req('GET',  `/stats/dashboard${qs(p)}`),
        },

        // ─── 이미지 업로드 ───────────────────────────────
        upload: {
            image: async (file) => {
                const fd = new FormData();
                fd.append('image', file);
                const res = await fetch(BASE + '/upload/image', { method: 'POST', body: fd });
                const data = await res.json();
                if (!res.ok || !data.success) throw new Error(data.error || 'Upload failed');
                return data;
            }
        },

        // ─── SMS 설정 ────────────────────────────────────
        sms: {
            status:   ()         => req('GET',  '/sms/status'),
            settings: (data)     => req('POST', '/sms/settings', data),
            test:     (phone, name) => req('POST', '/sms/test', { phone, name }),
        },

        // ─── CSV 가져오기 ────────────────────────────────
        importCsv: {
            templateUrl: (type) => `${BASE}/upload/csv/template/${type}`,
            applications: async (complexId, file, overwrite) => {
                const fd = new FormData();
                fd.append('file', file);
                fd.append('complex_id', complexId);
                if (overwrite) fd.append('overwrite', 'true');
                const res = await fetch(BASE + '/upload/csv/applications', { method: 'POST', body: fd });
                const data = await res.json();
                if (!res.ok || !data.success) throw new Error(data.error || 'Import failed');
                return data;
            },
            inquiries: async (complexId, file) => {
                const fd = new FormData();
                fd.append('file', file);
                fd.append('complex_id', complexId);
                const res = await fetch(BASE + '/upload/csv/inquiries', { method: 'POST', body: fd });
                const data = await res.json();
                if (!res.ok || !data.success) throw new Error(data.error || 'Import failed');
                return data;
            }
        }
    };
})();

window.API = API;
