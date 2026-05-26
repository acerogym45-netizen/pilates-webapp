/** 강사 관리 */
const instructors = {
    data: [],
    async render() {
        document.getElementById('pageContent').innerHTML = `
            <div class="page-header">
                <h2><i class="fas fa-user-tie"></i> 강사 관리</h2>
                <button class="btn-primary btn-sm" onclick="instructors.showForm()">
                    <i class="fas fa-plus"></i> 강사 추가
                </button>
            </div>
            <div id="instructorList" class="data-list"><div class="loading-mini"><i class="fas fa-spinner fa-spin"></i></div></div>`;
        await this.load();
    },
    async load() {
        try {
            const res = await API.instructors.list({ complexId: getEffectiveComplexId() });
            this.data = res.data || [];
            this.renderList();
        } catch(e) { document.getElementById('instructorList').innerHTML = `<p class="error-hint">${e.message}</p>`; }
    },
    renderList() {
        const c = document.getElementById('instructorList');
        if (!this.data.length) { c.innerHTML = '<p class="empty-hint">등록된 강사가 없습니다</p>'; return; }
        c.innerHTML = this.data.map(i => {
            const rates = i.hourly_rates || {};
            const rateStr = [
                rates.group   ? `그룹 ${Number(rates.group).toLocaleString('ko-KR')}원`   : '',
                rates.private ? `개인 ${Number(rates.private).toLocaleString('ko-KR')}원` : '',
                rates.duet    ? `듀엣 ${Number(rates.duet).toLocaleString('ko-KR')}원`    : '',
            ].filter(Boolean).join(' · ') || '-';

            // assigned_programs: 객체 배열 또는 구 문자열 배열 하위호환
            const ap = Array.isArray(i.assigned_programs) ? i.assigned_programs : [];
            let progBadges = '';
            if (!ap.length) {
                progBadges = '<span style="color:#bbb;font-size:.78rem">담당 미지정</span>';
            } else if (typeof ap[0] === 'string') {
                // 구 형식
                progBadges = ap.map(p =>
                    `<span style="background:#e8f8f0;color:#27ae60;font-size:.72rem;padding:2px 7px;border-radius:10px;margin-right:3px">${escHtml(p)}</span>`
                ).join('');
            } else {
                // 신 형식: 프로그램별로 묶어서 표시
                // - 그룹 수업: 프로그램명 (09:00, 10:00)
                // - 개인/듀엣: 프로그램명 (최윤서, 이미나)
                const progMap = {};
                ap.forEach(a => {
                    if (!progMap[a.program_name]) progMap[a.program_name] = [];
                    if (a.time_slot === 'free') {
                        // 수강생 이름으로 표시, 없으면 '자유'
                        progMap[a.program_name].push(a.student_name || '자유');
                    } else {
                        progMap[a.program_name].push(a.time_slot);
                    }
                });
                progBadges = Object.entries(progMap).map(([name, items]) => {
                    // 수강생 이름 목록인지 타임 목록인지 구분
                    const isStudentList = ap.some(a => a.program_name === name && a.time_slot === 'free' && a.student_name);
                    const badgeColor = isStudentList ? '#e67e22' : '#27ae60';
                    const bgColor    = isStudentList ? '#fef9e7' : '#e8f8f0';
                    const fgColor    = isStudentList ? '#7d5a00' : '#1a6b3c';
                    return `<span style="background:${bgColor};color:${fgColor};font-size:.72rem;padding:2px 8px;border-radius:10px;margin-right:3px;margin-bottom:2px;display:inline-block">
                        ${escHtml(name)}<span style="color:${badgeColor};margin-left:3px">(${items.map(s=>escHtml(s)).join(', ')})</span>
                    </span>`;
                }).join('');
            }
            // 연락처 표시
            const phoneStr = i.phone
                ? `<span style="margin-left:6px;color:#555"><i class="fas fa-phone-alt" style="font-size:.68rem;color:#3498db;margin-right:2px"></i>${escHtml(i.phone)}</span>`
                : '';

            // 계약기간 D-day 뱃지
            let dDayBadge = '';
            if (i.contract_end) {
                const today = new Date(); today.setHours(0,0,0,0);
                const end   = new Date(i.contract_end);
                const diff  = Math.round((end - today) / 86400000);
                if (diff < 0) {
                    dDayBadge = `<span style="background:#fdecea;color:#e74c3c;font-size:.68rem;font-weight:700;padding:1px 7px;border-radius:10px;margin-left:5px">계약만료</span>`;
                } else if (diff <= 30) {
                    dDayBadge = `<span style="background:#fff3e0;color:#e67e22;font-size:.68rem;font-weight:700;padding:1px 7px;border-radius:10px;margin-left:5px">D-${diff}</span>`;
                } else {
                    dDayBadge = `<span style="background:#e8f8f0;color:#27ae60;font-size:.68rem;font-weight:700;padding:1px 7px;border-radius:10px;margin-left:5px">D-${diff}</span>`;
                }
            }
            const contractStr = (i.contract_start || i.contract_end)
                ? `<p style="margin:2px 0;font-size:.75rem;color:#888">
                       <i class="fas fa-file-contract" style="font-size:.68rem;color:#e67e22;margin-right:2px"></i>
                       계약 ${i.contract_start ? escHtml(i.contract_start) : '?'} ~ ${i.contract_end ? escHtml(i.contract_end) : '?'}
                   </p>`
                : '';

            return `
            <div class="list-item" style="flex-wrap:wrap;gap:4px">
                ${i.photo_url ? `<img src="${i.photo_url}" class="item-thumb" alt="${i.name}">` : '<div class="item-thumb-placeholder"><i class="fas fa-user"></i></div>'}
                <div class="item-main" style="flex:1;min-width:0">
                    <strong>${i.name}</strong>${dDayBadge}
                    <p style="margin:2px 0">${i.title || '-'}${phoneStr}</p>
                    <p style="margin:2px 0;font-size:.78rem;color:#e67e22">
                        <i class="fas fa-won-sign" style="font-size:.7rem"></i> ${rateStr}
                    </p>
                    ${contractStr}
                    <div style="margin-top:4px">${progBadges}</div>
                </div>
                <div class="item-actions">
                    <button class="btn-ghost dark btn-sm" onclick="instructors.showForm('${i.id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn-ghost dark btn-sm" onclick="instructors.deleteItem('${i.id}')"><i class="fas fa-trash"></i></button>
                </div>
            </div>`;
        }).join('');
    },
    async showForm(id) {
        const i = id ? this.data.find(x => x.id === id) : null;

        // assigned_programs: 객체 배열
        // 그룹 수업: { program_id, program_name, time_slot, type }
        // 개인/듀엣: { program_id, program_name, time_slot:'free', type, application_id, student_name, student_dong, student_ho }
        const assignedArr = Array.isArray(i?.assigned_programs) ? i.assigned_programs : [];
        const isLegacy    = assignedArr.length > 0 && typeof assignedArr[0] === 'string';

        // 그룹 수업 담당 Set: "program_id|time_slot"
        const assignedSlotSet = new Set(
            isLegacy ? [] : assignedArr
                .filter(a => a.time_slot !== 'free')
                .map(a => `${a.program_id}|${a.time_slot}`)
        );
        // 개인/듀엣 담당 Set: "program_id|application_id"
        const assignedStudentSet = new Set(
            isLegacy ? [] : assignedArr
                .filter(a => a.time_slot === 'free' && a.application_id)
                .map(a => `${a.program_id}|${a.application_id}`)
        );

        const cid = getEffectiveComplexId() || i?.complex_id;
        let progTimeHtml = '';

        try {
            // 1) 프로그램 목록 로드
            const progRes  = await fetch(cid ? `/api/programs?complexId=${cid}` : '/api/programs');
            const progJson = await progRes.json();
            const seen = new Set();
            const loadedProgs = (progJson.data || []).filter(p => {
                if (!p.name || seen.has(p.id)) return false;
                seen.add(p.id); return true;
            });

            // 수업 유형 추정
            const getType = (name) => {
                const n = (name||'').toLowerCase();
                if (n.includes('개인') || n.includes('1:1')) return 'private';
                if (n.includes('듀엣') || n.includes('2:1')) return 'duet';
                return 'group';
            };

            // 2) 개인/듀엣 프로그램이 있으면 승인 수강생 미리 로드
            const freeProgs = loadedProgs.filter(p =>
                !(Array.isArray(p.time_slots) && p.time_slots.length)
            );
            // { program_name → [{ id, name, dong, ho, preferred_time }, ...] }
            const studentsMap = {};
            if (freeProgs.length && cid) {
                try {
                    const appRes  = await fetch(`/api/applications?complexId=${encodeURIComponent(cid)}&status=approved&limit=500`);
                    const appJson = await appRes.json();
                    (appJson.data || []).forEach(a => {
                        const pn = a.program_name || '';
                        if (!studentsMap[pn]) studentsMap[pn] = [];
                        studentsMap[pn].push(a);
                    });
                } catch(e2) {
                    console.warn('[instructor] 수강생 로드 실패:', e2.message);
                }
            }

            if (!loadedProgs.length) {
                progTimeHtml = '<p style="color:#aaa;font-size:.82rem">등록된 프로그램 없음</p>';
            } else {
                progTimeHtml = loadedProgs.map(p => {
                    const slots    = Array.isArray(p.time_slots) ? p.time_slots : [];
                    const pType    = getType(p.name);
                    const typeLabel = { group:'그룹', private:'개인', duet:'듀엣' }[pType];
                    const typeBadge = `<span style="font-size:.68rem;padding:1px 6px;border-radius:8px;font-weight:700;margin-left:4px;${
                        pType==='group' ? 'background:#e8f4fd;color:#2980b9'
                        : pType==='private' ? 'background:#fef9e7;color:#e67e22'
                        : 'background:#f5eef8;color:#8e44ad'}">${typeLabel}</span>`;

                    let bodyHtml;

                    if (slots.length) {
                        // ── 그룹 수업: 타임별 체크박스 ──
                        bodyHtml = `<div style="display:flex;flex-wrap:wrap;gap:2px">` +
                            slots.map(slot => {
                                const checked = assignedSlotSet.has(`${p.id}|${slot}`) ? 'checked' : '';
                                return `<label style="display:inline-flex;align-items:center;gap:4px;cursor:pointer;
                                    margin:2px 4px 2px 0;font-size:.82rem;background:#f8f8f8;
                                    border:1px solid #e0e0e0;border-radius:6px;padding:3px 9px">
                                    <input type="checkbox" name="iTimeSlot"
                                        data-prog-id="${p.id}"
                                        data-prog-name="${escHtml(p.name)}"
                                        data-slot="${escHtml(slot)}"
                                        data-type="${pType}"
                                        ${checked} style="cursor:pointer">
                                    <span style="font-weight:600">${slot}</span>
                                </label>`;
                            }).join('') + `</div>`;

                    } else {
                        // ── 개인/듀엣: 승인된 수강생 카드 리스트 ──
                        const students = studentsMap[p.name] || [];

                        if (!students.length) {
                            bodyHtml = `<div style="padding:8px 12px;background:#fafafa;border:1px dashed #ddd;
                                border-radius:7px;font-size:.8rem;color:#999;text-align:center">
                                <i class="fas fa-info-circle" style="margin-right:4px"></i>
                                승인된 수강생이 없습니다
                            </div>`;
                        } else {
                            const cards = students.map(st => {
                                const key     = `${p.id}|${st.id}`;
                                const checked = assignedStudentSet.has(key) ? 'checked' : '';
                                const loc     = [st.dong && st.dong+'동', st.ho && st.ho+'호'].filter(Boolean).join(' ');
                                const timeInfo = st.preferred_time
                                    ? `<div style="font-size:.72rem;color:#888;margin-top:1px">${escHtml(st.preferred_time)}</div>` : '';
                                return `<label style="display:flex;align-items:center;gap:9px;cursor:pointer;
                                    padding:8px 10px;border:1.5px solid ${checked ? '#e67e22' : '#ebebeb'};
                                    border-radius:8px;margin-bottom:5px;background:${checked ? '#fffbf5' : '#fafafa'};
                                    transition:border-color .12s,background .12s"
                                    onmouseenter="this.style.borderColor='#e67e22';this.style.background='#fffbf5'"
                                    onmouseleave="if(!this.querySelector('input').checked){this.style.borderColor='#ebebeb';this.style.background='#fafafa'}">
                                    <input type="checkbox" name="iTimeSlot"
                                        data-prog-id="${p.id}"
                                        data-prog-name="${escHtml(p.name)}"
                                        data-slot="free"
                                        data-type="${pType}"
                                        data-app-id="${escHtml(st.id)}"
                                        data-student-name="${escHtml(st.name||'')}"
                                        data-student-dong="${escHtml(st.dong||'')}"
                                        data-student-ho="${escHtml(st.ho||'')}"
                                        ${checked}
                                        onchange="(function(cb,lbl){lbl.style.borderColor=cb.checked?'#e67e22':'#ebebeb';lbl.style.background=cb.checked?'#fffbf5':'#fafafa';})(this,this.closest('label'))"
                                        style="cursor:pointer;width:16px;height:16px;accent-color:#e67e22;flex-shrink:0">
                                    <div style="flex:1;min-width:0">
                                        <div style="font-weight:700;font-size:.86rem;color:#1a252f">
                                            ${escHtml(st.name||'이름 없음')}
                                            ${loc ? `<span style="font-weight:400;font-size:.75rem;color:#777;margin-left:5px">${escHtml(loc)}</span>` : ''}
                                        </div>
                                        ${timeInfo}
                                    </div>
                                    <span style="flex-shrink:0;font-size:.68rem;padding:2px 7px;border-radius:10px;font-weight:600;${
                                        pType==='private' ? 'background:#fef9e7;color:#e67e22' : 'background:#f5eef8;color:#8e44ad'}">${typeLabel}</span>
                                </label>`;
                            }).join('');

                            bodyHtml = `<div>
                                <div style="font-size:.73rem;color:#888;margin-bottom:7px;display:flex;align-items:center;gap:4px">
                                    <i class="fas fa-user-check" style="color:#e67e22"></i>
                                    담당할 수강생을 선택하세요
                                    <span style="background:#e67e22;color:#fff;font-size:.65rem;font-weight:700;
                                        padding:1px 6px;border-radius:10px;margin-left:4px">${students.length}명 승인됨</span>
                                </div>
                                ${cards}
                            </div>`;
                        }
                    }

                    return `<div style="padding:8px 0;border-bottom:1px solid #e8f5e9">
                        <div style="font-size:.85rem;font-weight:700;color:#1a252f;margin-bottom:6px">
                            ${escHtml(p.name)}${typeBadge}
                        </div>
                        ${bodyHtml}
                    </div>`;
                }).join('');
            }
        } catch(e) {
            progTimeHtml = `<p style="color:#e74c3c;font-size:.82rem">프로그램 로드 실패: ${e.message}</p>`;
        }

        // 타임당 단가
        const rates       = i?.hourly_rates || {};
        const rateGroup   = rates.group   || 0;
        const ratePrivate = rates.private  || 0;
        const rateDuet    = rates.duet     || 0;

        // 계약기간 D-day 계산
        const contractEnd = i?.contract_end || '';
        let contractDday = '';
        if (contractEnd) {
            const today = new Date(); today.setHours(0,0,0,0);
            const end   = new Date(contractEnd);
            const diff  = Math.round((end - today) / 86400000);
            if      (diff < 0)  contractDday = `<span style="color:#e74c3c;font-weight:700">만료 (${Math.abs(diff)}일 경과)</span>`;
            else if (diff === 0) contractDday = `<span style="color:#e74c3c;font-weight:700">오늘 만료</span>`;
            else if (diff <= 30) contractDday = `<span style="color:#e67e22;font-weight:700">D-${diff}</span>`;
            else                 contractDday = `<span style="color:#27ae60;font-weight:700">D-${diff}</span>`;
        }

        const body = `
            <div class="form-group"><label>이름 *</label>
                <input type="text" id="iName" value="${i ? escHtml(i.name) : ''}">
            </div>
            <div class="form-group"><label>직함</label>
                <input type="text" id="iTitle" value="${i ? escHtml(i.title||'') : ''}" placeholder="예: 필라테스 전문 강사">
            </div>
            <div class="form-group"><label>소개</label>
                <textarea id="iBio" rows="3">${i ? escHtml(i.bio||'') : ''}</textarea>
            </div>
            <div class="form-group">
                <label>사진 URL</label>
                <input type="text" id="iPhoto" value="${i ? escHtml(i.photo_url||'') : ''}" placeholder="https://... 또는 /uploads/파일명">
                <small style="color:#999">또는 파일 직접 업로드:</small>
                <input type="file" id="iPhotoFile" accept="image/*" onchange="instructors.previewPhoto(this)">
                <div id="iPhotoPreview" style="margin-top:8px">
                    ${i?.photo_url ? `<img src="${i.photo_url}" style="width:80px;height:80px;object-fit:cover;border-radius:8px">` : ''}
                </div>
            </div>
            <div class="form-group"><label>표시 순서</label>
                <input type="number" id="iOrder" value="${i?.display_order||0}">
            </div>

            <!-- ── 연락처 / 노무 정보 ── -->
            <div class="form-group" style="background:#f0f4ff;border:1.5px solid #aec6f8;border-radius:8px;padding:14px 16px;margin-top:4px">
                <label style="font-weight:700;color:#333;margin-bottom:12px;display:block">
                    <i class="fas fa-id-card" style="color:#3498db;margin-right:4px"></i>연락처 &amp; 노무 정보
                    <span style="font-size:.73rem;font-weight:400;color:#999;margin-left:6px">급여명세서 발송 · 계약서 관리용</span>
                </label>

                <!-- 연락처 -->
                <div style="margin-bottom:12px">
                    <label style="font-size:.78rem;color:#3498db;font-weight:700;margin-bottom:5px;display:flex;align-items:center;gap:4px">
                        <i class="fas fa-phone-alt" style="font-size:.72rem"></i>연락처
                        <span style="font-size:.68rem;font-weight:400;color:#999">(급여명세서 자동발송 SMS 수신 번호)</span>
                    </label>
                    <input type="tel" id="iPhone"
                        value="${escHtml(i?.phone||'')}"
                        placeholder="010-0000-0000"
                        style="width:100%;padding:8px 11px;border:1.5px solid #aec6f8;border-radius:6px;font-size:.9rem"
                        oninput="instructors._fmtPhone(this)">
                </div>

                <!-- 계좌번호 -->
                <div style="margin-bottom:12px">
                    <label style="font-size:.78rem;color:#3498db;font-weight:700;margin-bottom:5px;display:flex;align-items:center;gap:4px">
                        <i class="fas fa-university" style="font-size:.72rem"></i>입금 계좌번호
                    </label>
                    <input type="text" id="iBankAccount"
                        value="${escHtml(i?.bank_account||'')}"
                        placeholder="은행명 + 계좌번호 (예: 국민 123-456-789012)"
                        style="width:100%;padding:8px 11px;border:1.5px solid #aec6f8;border-radius:6px;font-size:.9rem">
                </div>

                <!-- 주민등록번호 -->
                <div>
                    <label style="font-size:.78rem;color:#e74c3c;font-weight:700;margin-bottom:5px;display:flex;align-items:center;gap:4px">
                        <i class="fas fa-lock" style="font-size:.72rem"></i>주민등록번호
                        <span style="font-size:.68rem;font-weight:400;color:#999">(원천징수 · 4대보험 신고용 — 암호화 저장)</span>
                    </label>
                    <input type="text" id="iRrn"
                        value="${escHtml(i?.rrn||'')}"
                        placeholder="000000-0000000"
                        maxlength="14"
                        style="width:100%;padding:8px 11px;border:1.5px solid #f1948a;border-radius:6px;font-size:.9rem;letter-spacing:1px"
                        oninput="instructors._fmtRrn(this)">
                    <div style="font-size:.7rem;color:#e74c3c;margin-top:3px;display:flex;align-items:center;gap:3px">
                        <i class="fas fa-shield-alt"></i> 관리자 전용 항목입니다. 외부 노출에 주의하세요.
                    </div>
                </div>
            </div>

            <!-- ── 계약기간 ── -->
            <div class="form-group" style="background:#fffbf0;border:1.5px solid #f9e4a0;border-radius:8px;padding:14px 16px;margin-top:4px">
                <label style="font-weight:700;color:#333;margin-bottom:12px;display:block">
                    <i class="fas fa-file-contract" style="color:#e67e22;margin-right:4px"></i>계약기간
                    <span style="font-size:.73rem;font-weight:400;color:#999;margin-left:6px">계약서 관리 · 갱신 알림용</span>
                    ${contractDday ? `<span style="margin-left:8px;font-size:.78rem">${contractDday}</span>` : ''}
                </label>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                    <div>
                        <label style="font-size:.78rem;color:#e67e22;font-weight:700;margin-bottom:5px;display:block">계약 시작일</label>
                        <input type="date" id="iContractStart"
                            value="${escHtml(i?.contract_start||'')}"
                            style="width:100%;padding:8px 11px;border:1.5px solid #f9e4a0;border-radius:6px;font-size:.9rem">
                    </div>
                    <div>
                        <label style="font-size:.78rem;color:#e67e22;font-weight:700;margin-bottom:5px;display:block">계약 종료일</label>
                        <input type="date" id="iContractEnd"
                            value="${escHtml(i?.contract_end||'')}"
                            style="width:100%;padding:8px 11px;border:1.5px solid #f9e4a0;border-radius:6px;font-size:.9rem"
                            onchange="instructors._updateDday(this.value)">
                    </div>
                </div>
                <div id="iDdayDisplay" style="margin-top:8px;font-size:.8rem;text-align:center;min-height:18px">
                    ${contractDday ? `계약 종료일까지 ${contractDday}` : ''}
                </div>
            </div>

            <!-- ── 타임당 단가 ── -->
            <div class="form-group" style="background:#f8f9fa;border:1.5px solid #e0e0e0;border-radius:8px;padding:14px 16px;margin-top:4px">
                <label style="font-weight:700;color:#333;margin-bottom:10px;display:block">
                    <i class="fas fa-won-sign" style="color:#e67e22;margin-right:4px"></i>타임당 단가 (원)
                    <span style="font-size:.75rem;font-weight:400;color:#999;margin-left:6px">수업 유형별 1타임당 강사료</span>
                </label>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
                    <div>
                        <label style="font-size:.78rem;color:#2980b9;font-weight:700;margin-bottom:4px;display:block">그룹 수업</label>
                        <input type="number" id="iRateGroup" value="${rateGroup}" min="0" step="1000"
                            style="width:100%;padding:7px 10px;border:1.5px solid #aed6f1;border-radius:6px;font-size:.9rem;font-weight:700;text-align:right">
                    </div>
                    <div>
                        <label style="font-size:.78rem;color:#e67e22;font-weight:700;margin-bottom:4px;display:block">개인 레슨</label>
                        <input type="number" id="iRatePrivate" value="${ratePrivate}" min="0" step="1000"
                            style="width:100%;padding:7px 10px;border:1.5px solid #f9ca8b;border-radius:6px;font-size:.9rem;font-weight:700;text-align:right">
                    </div>
                    <div>
                        <label style="font-size:.78rem;color:#8e44ad;font-weight:700;margin-bottom:4px;display:block">듀엣 레슨</label>
                        <input type="number" id="iRateDuet" value="${rateDuet}" min="0" step="1000"
                            style="width:100%;padding:7px 10px;border:1.5px solid #d7bde2;border-radius:6px;font-size:.9rem;font-weight:700;text-align:right">
                    </div>
                </div>
            </div>

            <!-- ── 담당 타임/수강생 설정 ── -->
            <div class="form-group" style="background:#f0fff4;border:1.5px solid #a9dfbf;border-radius:8px;padding:14px 16px;margin-top:4px">
                <label style="font-weight:700;color:#333;margin-bottom:4px;display:block">
                    <i class="fas fa-clock" style="color:#27ae60;margin-right:4px"></i>담당 설정
                    <span style="font-size:.75rem;font-weight:400;color:#999;margin-left:6px">그룹: 타임 체크 / 개인·듀엣: 담당 수강생 선택</span>
                </label>
                <div id="iTimeSlots" style="max-height:360px;overflow-y:auto;padding-right:4px">
                    ${progTimeHtml}
                </div>
            </div>`;

        const footer = `
            <button class="btn-secondary" onclick="closeGlobalModal()">취소</button>
            <button class="btn-primary" onclick="instructors.save('${id||''}')"><i class="fas fa-save"></i> 저장</button>`;
        openGlobalModal(i ? '강사 수정' : '강사 추가', body, footer);
    },
    previewPhoto(input) {
        if (!input.files[0]) return;
        const file = input.files[0];
        const reader = new FileReader();
        reader.onload = e => {
            const preview = document.getElementById('iPhotoPreview');
            if (preview) {
                preview.innerHTML = `
                    <img src="${e.target.result}" style="width:80px;height:80px;object-fit:cover;border-radius:8px;border:2px solid #27ae60">
                    <div style="font-size:.75rem;color:#27ae60;margin-top:4px"><i class="fas fa-check-circle"></i> 파일 선택됨: ${escHtml(file.name)}</div>`;
            }
            // iPhoto URL 필드는 비워두기 (파일 우선 사용 명확히 표시)
            const iPhoto = document.getElementById('iPhoto');
            if (iPhoto) iPhoto.placeholder = '파일 업로드 선택됨 (저장 시 자동 처리)';
        };
        reader.readAsDataURL(file);
    },
    // 이미지를 Canvas로 리사이즈 후 Blob 반환 (최대 800px, JPEG 0.85)
    _resizeImage(file, maxPx = 800) {
        return new Promise((resolve) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                URL.revokeObjectURL(url);
                let w = img.width, h = img.height;
                if (w > maxPx || h > maxPx) {
                    if (w >= h) { h = Math.round(h * maxPx / w); w = maxPx; }
                    else        { w = Math.round(w * maxPx / h); h = maxPx; }
                }
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.85);
            };
            img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
            img.src = url;
        });
    },
    async save(id) {
        const name = document.getElementById('iName').value.trim();
        if (!name) { showToast('이름을 입력하세요', 'error'); return; }

        // 저장 버튼 로딩 표시
        const saveBtn = document.querySelector('#globalModal .btn-primary');
        if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 저장 중...'; }

        let photoUrl = document.getElementById('iPhoto').value.trim();
        const fileInput = document.getElementById('iPhotoFile');

        // 파일 업로드 처리 (Canvas 리사이즈 → JPEG → FormData)
        if (fileInput && fileInput.files && fileInput.files[0]) {
            try {
                const origFile = fileInput.files[0];
                // Canvas로 리사이즈 (최대 800px, JPEG 변환) → multipart 오류 방지
                const blob = await this._resizeImage(origFile);
                const uploadFile = blob
                    ? new File([blob], 'photo.jpg', { type: 'image/jpeg' })
                    : origFile;

                const formData = new FormData();
                formData.append('image', uploadFile);
                const uploadUrl = window.location.origin + '/api/upload/image';
                const res = await fetch(uploadUrl, { method: 'POST', body: formData });
                // 에러 응답 body도 읽어서 정확한 메시지 표시
                const result = await res.json().catch(() => ({ success: false, error: 'HTTP ' + res.status }));
                if (res.ok && result.success && result.url) {
                    photoUrl = result.url;
                    console.log('[instructor] 이미지 업로드 성공:', photoUrl);
                } else {
                    throw new Error(result.error || 'HTTP ' + res.status);
                }
            } catch(e) {
                console.error('[instructor] 이미지 업로드 실패:', e);
                if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> 저장'; }
                showToast('이미지 업로드 실패: ' + e.message, 'error');
                return;
            }
        }

        try {
            // 담당 타임 체크박스 수집 → 객체 배열로 변환
            // 그룹 수업: { program_id, program_name, time_slot, type }
            // 개인/듀엣: { program_id, program_name, time_slot:'free', type, application_id, student_name, student_dong, student_ho }
            const assignedPrograms = Array.from(
                document.querySelectorAll('input[name="iTimeSlot"]:checked')
            ).map(cb => {
                const entry = {
                    program_id:   cb.dataset.progId,
                    program_name: cb.dataset.progName,
                    time_slot:    cb.dataset.slot,
                    type:         cb.dataset.type,
                };
                // 개인/듀엣 수강생 배정: data-app-id, data-student-* 포함
                if (cb.dataset.slot === 'free' && cb.dataset.appId) {
                    entry.application_id  = cb.dataset.appId;
                    entry.student_name    = cb.dataset.studentName  || '';
                    entry.student_dong    = cb.dataset.studentDong  || '';
                    entry.student_ho      = cb.dataset.studentHo    || '';
                }
                return entry;
            });

            // 타임당 단가 수집
            const hourlyRates = {
                group:   parseInt(document.getElementById('iRateGroup')?.value)   || 0,
                private: parseInt(document.getElementById('iRatePrivate')?.value) || 0,
                duet:    parseInt(document.getElementById('iRateDuet')?.value)    || 0,
            };

            const data = {
                name, title: document.getElementById('iTitle').value,
                bio: document.getElementById('iBio').value,
                photo_url: photoUrl,
                display_order: parseInt(document.getElementById('iOrder').value)||0,
                hourly_rates: hourlyRates,
                assigned_programs: assignedPrograms,
                phone:          (document.getElementById('iPhone')?.value        || '').trim(),
                bank_account:   (document.getElementById('iBankAccount')?.value  || '').trim(),
                rrn:            (document.getElementById('iRrn')?.value           || '').trim(),
                contract_start: document.getElementById('iContractStart')?.value || null,
                contract_end:   document.getElementById('iContractEnd')?.value   || null,
            };
            if (id) {
                await API.instructors.update(id, data);
                closeGlobalModal();
                showToast('저장되었습니다');
                await this.load();
            } else {
                const complexId = getEffectiveComplexId();
                if (!complexId) {
                    pickComplexForCreate(async (cxId) => {
                        data.complex_id = cxId;
                        try {
                            await API.instructors.create(data);
                            closeGlobalModal();
                            showToast('저장되었습니다');
                            await instructors.load();
                        }
                        catch(e) { showToast('저장 실패: ' + e.message, 'error'); }
                    });
                    return;
                }
                data.complex_id = complexId;
                await API.instructors.create(data);
                closeGlobalModal();
                showToast('저장되었습니다');
                await this.load();
            }
        } catch(e) {
            console.error('[instructor] save 오류:', e);
            if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> 저장'; }
            showToast('저장 실패: ' + e.message, 'error');
        }
    },
    deleteItem(id) {
        showConfirm('삭제 확인', '강사를 삭제하시겠습니까?', async () => {
            try { await API.instructors.delete(id); showToast('삭제되었습니다'); await this.load(); }
            catch(e) { showToast('삭제 실패: ' + e.message, 'error'); }
        });
    },

    // ── 전화번호 자동 하이픈 ──
    _fmtPhone(input) {
        let v = input.value.replace(/\D/g, '');
        if (v.length <= 3)       input.value = v;
        else if (v.length <= 7)  input.value = v.slice(0,3) + '-' + v.slice(3);
        else if (v.length <= 11) input.value = v.slice(0,3) + '-' + v.slice(3,7) + '-' + v.slice(7);
        else                     input.value = v.slice(0,3) + '-' + v.slice(3,7) + '-' + v.slice(7,11);
    },

    // ── 주민등록번호 자동 하이픈 ──
    _fmtRrn(input) {
        let v = input.value.replace(/\D/g, '');
        if (v.length <= 6) input.value = v;
        else               input.value = v.slice(0,6) + '-' + v.slice(6,13);
    },

    // ── 계약 종료일 변경 시 D-day 실시간 표시 ──
    _updateDday(dateStr) {
        const el = document.getElementById('iDdayDisplay');
        if (!el) return;
        if (!dateStr) { el.innerHTML = ''; return; }
        const today = new Date(); today.setHours(0,0,0,0);
        const end   = new Date(dateStr);
        const diff  = Math.round((end - today) / 86400000);
        let badge = '';
        if      (diff < 0)  badge = `<span style="color:#e74c3c;font-weight:700">계약 만료 (${Math.abs(diff)}일 경과)</span>`;
        else if (diff === 0) badge = `<span style="color:#e74c3c;font-weight:700">오늘 만료</span>`;
        else if (diff <= 30) badge = `<span style="color:#e67e22;font-weight:700">D-${diff} (30일 이내 갱신 권장)</span>`;
        else                 badge = `<span style="color:#27ae60;font-weight:700">D-${diff}</span>`;
        el.innerHTML = `계약 종료일까지 ${badge}`;
    },
};

/** 커리큘럼 관리 */
const curricula = {
    data: [],
    async render() {
        const now = new Date();
        document.getElementById('pageContent').innerHTML = `
            <div class="page-header">
                <h2><i class="fas fa-calendar-alt"></i> 커리큘럼 관리</h2>
                <button class="btn-primary btn-sm" onclick="curricula.showForm()">
                    <i class="fas fa-plus"></i> 커리큘럼 등록
                </button>
            </div>
            <div id="curricList" class="data-list"><div class="loading-mini"><i class="fas fa-spinner fa-spin"></i></div></div>`;
        await this.load();
    },
    async load() {
        try {
            const res = await API.curricula.list({ complexId: getEffectiveComplexId() });
            this.data = res.data || [];
            this.renderList();
        } catch(e) { document.getElementById('curricList').innerHTML = `<p class="error-hint">${e.message}</p>`; }
    },
    renderList() {
        const c = document.getElementById('curricList');
        if (!this.data.length) { c.innerHTML = '<p class="empty-hint">등록된 커리큘럼이 없습니다</p>'; return; }
        c.innerHTML = this.data.map(cu => `
            <div class="list-item">
                ${cu.image_url ? `<img src="${cu.image_url}" class="item-thumb" alt="${cu.year}년 ${cu.month}월">` : ''}
                <div class="item-main">
                    <strong>${cu.year}년 ${cu.month}월 커리큘럼</strong>
                    <p>${cu.title || ''}</p>
                </div>
                <div class="item-actions">
                    <button class="btn-ghost dark btn-sm" onclick="curricula.showForm('${cu.id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn-ghost dark btn-sm" onclick="curricula.deleteItem('${cu.id}')"><i class="fas fa-trash"></i></button>
                </div>
            </div>`).join('');
    },
    showForm(id) {
        const cu = id ? this.data.find(x => x.id === id) : null;
        const now = new Date();
        const body = `
            <div class="form-row">
                <div class="form-group"><label>년도</label><input type="number" id="cuYear" value="${cu?.year||now.getFullYear()}"></div>
                <div class="form-group"><label>월</label><input type="number" id="cuMonth" min="1" max="12" value="${cu?.month||(now.getMonth()+1)}"></div>
            </div>
            <div class="form-group"><label>제목</label><input type="text" id="cuTitle" value="${cu ? escHtml(cu.title||'') : ''}"></div>
            <div class="form-group"><label>내용</label><textarea id="cuContent" rows="5">${cu ? escHtml(cu.content||'') : ''}</textarea></div>
            <div class="form-group">
                <label>이미지 URL</label>
                <input type="text" id="cuImage" value="${cu ? escHtml(cu.image_url||'') : ''}" placeholder="https://...">
                <small>또는 파일 업로드:</small>
                <input type="file" id="cuImageFile" accept="image/*">
            </div>`;
        const footer = `
            <button class="btn-secondary" onclick="closeGlobalModal()">취소</button>
            <button class="btn-primary" onclick="curricula.save('${id||''}')"><i class="fas fa-save"></i> 저장</button>`;
        openGlobalModal(cu ? '커리큘럼 수정' : '커리큘럼 등록', body, footer);
    },
    async save(id) {
        // 저장 버튼 로딩 표시
        const saveBtn = document.querySelector('#globalModal .btn-primary');
        if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 저장 중...'; }

        let imageUrl = document.getElementById('cuImage').value.trim();
        const fileInput = document.getElementById('cuImageFile');

        // 파일 업로드 처리 (Canvas 리사이즈 → JPEG → FormData)
        if (fileInput && fileInput.files && fileInput.files[0]) {
            try {
                const origFile = fileInput.files[0];
                const blob = await instructors._resizeImage(origFile);
                const uploadFile = blob
                    ? new File([blob], 'image.jpg', { type: 'image/jpeg' })
                    : origFile;
                const formData = new FormData();
                formData.append('image', uploadFile);
                const uploadUrl = window.location.origin + '/api/upload/image';
                const res = await fetch(uploadUrl, { method: 'POST', body: formData });
                const result = await res.json().catch(() => ({ success: false, error: 'HTTP ' + res.status }));
                if (res.ok && result.success && result.url) {
                    imageUrl = result.url;
                } else {
                    throw new Error(result.error || 'HTTP ' + res.status);
                }
            } catch(e) {
                console.error('[curricula] 이미지 업로드 실패:', e);
                if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> 저장'; }
                showToast('이미지 업로드 실패: ' + e.message, 'error');
                return;
            }
        }

        try {
            const formData = {
                year: parseInt(document.getElementById('cuYear').value),
                month: parseInt(document.getElementById('cuMonth').value),
                title: document.getElementById('cuTitle').value,
                content: document.getElementById('cuContent').value,
                image_url: imageUrl
            };

            if (id) {
                // 수정: PUT /curricula/:id
                await API.curricula.update(id, formData);
                closeGlobalModal();
                showToast('저장되었습니다');
                await this.load();
            } else {
                // 신규: complex_id 필요
                const complexId = getEffectiveComplexId();
                if (!complexId) {
                    pickComplexForCreate(async (cxId) => {
                        try {
                            await API.curricula.create({ complex_id: cxId, ...formData });
                            closeGlobalModal();
                            showToast('저장되었습니다');
                            await curricula.load();
                        } catch(e) { showToast('저장 실패: ' + e.message, 'error'); }
                    });
                    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> 저장'; }
                    return;
                }
                await API.curricula.create({ complex_id: complexId, ...formData });
                closeGlobalModal();
                showToast('저장되었습니다');
                await this.load();
            }
        } catch(e) {
            console.error('[curricula] save 오류:', e);
            if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> 저장'; }
            showToast('저장 실패: ' + e.message, 'error');
        }
    },
    deleteItem(id) {
        showConfirm('삭제 확인', '커리큘럼을 삭제하시겠습니까?', async () => {
            try { await API.curricula.delete(id); showToast('삭제되었습니다'); await this.load(); }
            catch(e) { showToast('삭제 실패: ' + e.message, 'error'); }
        });
    }
};

/** 시간표 관리 */
const timetables = {
    async render() {
        const complexId = getEffectiveComplexId();
        document.getElementById('pageContent').innerHTML = `
            <div class="page-header">
                <h2><i class="fas fa-table"></i> 시간표 관리</h2>
            </div>
            <div class="card" style="padding:24px;max-width:640px">
                <p style="color:#888;margin-bottom:20px;font-size:.92rem">
                    입주민 페이지의 <strong>"시간표"</strong> 버튼을 눌렀을 때 표시되는 이미지입니다.<br>
                    이미지 파일을 업로드하거나 외부 URL을 직접 입력하세요.
                </p>

                <div id="timetablePreviewWrap" style="margin-bottom:20px;display:none">
                    <p style="font-size:.85rem;color:#666;margin-bottom:8px">현재 등록된 시간표:</p>
                    <img id="timetablePreviewImg" src="" alt="시간표"
                         style="max-width:100%;border-radius:8px;border:1px solid #e2e8f0;cursor:pointer"
                         onclick="notices_openImageModal(this.src)">
                    <div style="margin-top:10px">
                        <button class="btn-ghost dark btn-sm" onclick="timetables.clearTimetable()">
                            <i class="fas fa-trash"></i> 시간표 삭제
                        </button>
                    </div>
                </div>
                <div id="timetableEmptyHint" style="margin-bottom:20px;display:none">
                    <p style="color:#aaa;font-size:.9rem"><i class="fas fa-image"></i> 등록된 시간표가 없습니다.</p>
                </div>

                <div class="form-group" style="margin-bottom:16px">
                    <label style="font-weight:600">이미지 파일 업로드</label>
                    <input type="file" id="timetableFile" accept="image/*" style="margin-top:6px">
                    <small style="color:#888">JPG, PNG, GIF — 파일 업로드 시 기존 시간표가 교체됩니다.</small>
                </div>

                <div class="form-group" style="margin-bottom:20px">
                    <label style="font-weight:600">또는 이미지 URL 직접 입력</label>
                    <input type="text" id="timetableUrl" placeholder="https://..." style="margin-top:6px;width:100%">
                </div>

                <div style="display:flex;gap:10px">
                    <button class="btn-primary" onclick="timetables.save()">
                        <i class="fas fa-save"></i> 저장
                    </button>
                </div>
            </div>`;

        await this.loadPreview(complexId);
    },

    async loadPreview(complexId) {
        if (!complexId) return;
        try {
            const res  = await fetch(`/api/complexes/timetable?id=${complexId}`);
            const json = await res.json();
            const url  = json.timetable_url;
            const previewWrap  = document.getElementById('timetablePreviewWrap');
            const emptyHint    = document.getElementById('timetableEmptyHint');
            const previewImg   = document.getElementById('timetablePreviewImg');
            const urlInput     = document.getElementById('timetableUrl');
            if (url) {
                previewImg.src      = url;
                if (urlInput) urlInput.value = url;
                previewWrap.style.display = '';
                emptyHint.style.display   = 'none';
            } else {
                previewWrap.style.display = 'none';
                emptyHint.style.display   = '';
            }
        } catch(e) {
            console.error('[timetables] loadPreview 오류:', e);
        }
    },

    async save() {
        const complexId = getEffectiveComplexId();
        if (!complexId) {
            showToast('단지를 먼저 선택하세요', 'error');
            return;
        }

        const saveBtn = document.querySelector('#pageContent .btn-primary');
        if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 저장 중...'; }

        try {
            let timetableUrl = (document.getElementById('timetableUrl')?.value || '').trim();
            const fileInput  = document.getElementById('timetableFile');

            // 파일 업로드 우선
            if (fileInput && fileInput.files && fileInput.files[0]) {
                const origFile = fileInput.files[0];
                let uploadFile = origFile;

                // Canvas 리사이즈 (instructors._resizeImage 재사용)
                try {
                    const blob = await instructors._resizeImage(origFile);
                    if (blob) uploadFile = new File([blob], 'timetable.jpg', { type: 'image/jpeg' });
                } catch(e) { /* 리사이즈 실패 시 원본 사용 */ }

                const fd = new FormData();
                fd.append('image', uploadFile);
                const upRes    = await fetch('/api/upload/image', { method: 'POST', body: fd });
                const upJson   = await upRes.json().catch(() => ({ success: false, error: 'HTTP ' + upRes.status }));
                if (!upRes.ok || !upJson.success || !upJson.url) {
                    throw new Error(upJson.error || '이미지 업로드 실패');
                }
                timetableUrl = upJson.url;
            }

            if (!timetableUrl) {
                showToast('이미지 파일을 업로드하거나 URL을 입력하세요', 'error');
                if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> 저장'; }
                return;
            }

            await API.complexes.updateTimetable(complexId, { timetable_url: timetableUrl });
            showToast('시간표가 저장되었습니다');
            await this.loadPreview(complexId);
        } catch(e) {
            console.error('[timetables] save 오류:', e);
            showToast('저장 실패: ' + e.message, 'error');
        } finally {
            if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> 저장'; }
        }
    },

    async clearTimetable() {
        const complexId = getEffectiveComplexId();
        if (!complexId) return;
        showConfirm('삭제 확인', '시간표 이미지를 삭제하시겠습니까?', async () => {
            try {
                await API.complexes.updateTimetable(complexId, { timetable_url: null });
                showToast('시간표가 삭제되었습니다');
                await this.loadPreview(complexId);
                const urlInput = document.getElementById('timetableUrl');
                if (urlInput) urlInput.value = '';
                const fileInput = document.getElementById('timetableFile');
                if (fileInput) fileInput.value = '';
            } catch(e) {
                showToast('삭제 실패: ' + e.message, 'error');
            }
        });
    }
};
