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
                ${(i.photo_urls?.[0] || i.photo_url) ? `<img src="${escHtml(i.photo_urls?.[0] || i.photo_url)}" class="item-thumb" alt="${escHtml(i.name)}">` : '<div class="item-thumb-placeholder"><i class="fas fa-user"></i></div>'}
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
                <label>사진 <span style="font-size:.8rem;color:#888;font-weight:400">(최대 10장, 첫 번째가 대표 사진)</span></label>
                <div id="iPhotoGrid" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px">
                    ${instructors._renderPhotoGrid(i)}
                </div>
                <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;background:#f0f4ff;border:1.5px dashed #6366f1;border-radius:8px;padding:8px 14px;font-size:.875rem;color:#6366f1;font-weight:500">
                    <i class="fas fa-plus-circle"></i> 사진 추가 (최대 10장)
                    <input type="file" id="iPhotoFile" accept="image/*" multiple style="display:none"
                           onchange="instructors.handlePhotoAdd(this)">
                </label>
                <div id="iPhotoCount" style="margin-top:6px;font-size:.78rem;color:#888">
                    ${instructors._getPhotoCount(i)}장 / 10장
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
    // ── 다중 사진 관련 헬퍼 ──────────────────────────────────────────────

    // 기존 사진 목록 반환 (photo_urls 배열 우선, photo_url 단일 fallback)
    _getPhotos(instructor) {
        if (!instructor) return [];
        const urls = Array.isArray(instructor.photo_urls) ? instructor.photo_urls : [];
        if (urls.length > 0) return urls;
        if (instructor.photo_url) return [instructor.photo_url];
        return [];
    },

    _getPhotoCount(instructor) {
        return this._getPhotos(instructor).length;
    },

    // 사진 그리드 HTML 렌더링
    _renderPhotoGrid(instructor) {
        const photos = this._getPhotos(instructor);
        if (photos.length === 0) {
            return `<div style="color:#aaa;font-size:.85rem;padding:8px 0"><i class="fas fa-image"></i> 등록된 사진 없음</div>`;
        }
        return photos.map((url, idx) => `
            <div style="position:relative;display:inline-block" data-photo-idx="${idx}">
                <img src="${escHtml(url)}" style="width:80px;height:80px;object-fit:cover;border-radius:8px;border:2px solid ${idx===0?'#6366f1':'#e5e7eb'}">
                ${idx===0 ? `<span style="position:absolute;bottom:2px;left:2px;background:#6366f1;color:#fff;font-size:.6rem;padding:1px 4px;border-radius:4px">대표</span>` : ''}
                <button type="button" onclick="instructors._removePhoto(${idx})"
                    style="position:absolute;top:-6px;right:-6px;background:#ef4444;color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:.7rem;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1">
                    <i class="fas fa-times"></i>
                </button>
            </div>`).join('');
    },

    // 현재 폼에 있는 사진 URL 목록 (data attribute 기반)
    _getFormPhotos() {
        const grid = document.getElementById('iPhotoGrid');
        if (!grid) return [];
        return Array.from(grid.querySelectorAll('[data-photo-idx]'))
            .map(el => el.querySelector('img')?.src)
            .filter(Boolean);
    },

    // 사진 삭제
    _removePhoto(idx) {
        const photos = this._getFormPhotos();
        photos.splice(idx, 1);
        this._refreshPhotoGrid(photos);
    },

    // 그리드 새로 그리기
    _refreshPhotoGrid(photos) {
        const grid = document.getElementById('iPhotoGrid');
        const countEl = document.getElementById('iPhotoCount');
        if (!grid) return;
        if (photos.length === 0) {
            grid.innerHTML = `<div style="color:#aaa;font-size:.85rem;padding:8px 0"><i class="fas fa-image"></i> 등록된 사진 없음</div>`;
        } else {
            grid.innerHTML = photos.map((url, idx) => `
                <div style="position:relative;display:inline-block" data-photo-idx="${idx}">
                    <img src="${escHtml(url)}" style="width:80px;height:80px;object-fit:cover;border-radius:8px;border:2px solid ${idx===0?'#6366f1':'#e5e7eb'}">
                    ${idx===0 ? `<span style="position:absolute;bottom:2px;left:2px;background:#6366f1;color:#fff;font-size:.6rem;padding:1px 4px;border-radius:4px">대표</span>` : ''}
                    <button type="button" onclick="instructors._removePhoto(${idx})"
                        style="position:absolute;top:-6px;right:-6px;background:#ef4444;color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:.7rem;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1">
                        <i class="fas fa-times"></i>
                    </button>
                </div>`).join('');
        }
        if (countEl) countEl.textContent = `${photos.length}장 / 10장`;
    },

    // 파일 선택 → 업로드 → 그리드에 추가
    async handlePhotoAdd(input) {
        if (!input.files || input.files.length === 0) return;
        const current = this._getFormPhotos();
        const remaining = 10 - current.length;
        if (remaining <= 0) { showToast('사진은 최대 10장까지 등록할 수 있습니다', 'error'); input.value=''; return; }

        const files = Array.from(input.files).slice(0, remaining);
        if (files.length < input.files.length) {
            showToast(`10장 초과분(${input.files.length - files.length}장)은 제외됩니다`, 'error');
        }

        const countEl = document.getElementById('iPhotoCount');
        if (countEl) countEl.textContent = '업로드 중...';

        const newUrls = [];
        for (const file of files) {
            try {
                const blob = await this._resizeImage(file);
                const uploadFile = blob ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : file;
                const fd = new FormData();
                fd.append('image', uploadFile);
                const res = await fetch(window.location.origin + '/api/upload/image', { method: 'POST', body: fd });
                const result = await res.json().catch(() => ({ success: false, error: 'HTTP ' + res.status }));
                if (res.ok && result.success && result.url) {
                    newUrls.push(result.url);
                } else {
                    showToast('업로드 실패: ' + (result.error || '알 수 없는 오류'), 'error');
                }
            } catch(e) {
                showToast('업로드 실패: ' + e.message, 'error');
            }
        }

        this._refreshPhotoGrid([...current, ...newUrls]);
        input.value = ''; // 같은 파일 재선택 허용
    },

    previewPhoto(input) {
        // 구버전 단일 사진 미리보기 (하위 호환용 - 현재는 handlePhotoAdd로 대체됨)
        if (!input.files[0]) return;
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

        // ── 다중 사진: 폼 그리드에서 현재 URL 목록 수집 ─────────────────────
        // handlePhotoAdd()에서 이미 업로드 완료된 URL들이 그리드에 있음
        const photoUrls = this._getFormPhotos();
        const photoUrl  = photoUrls[0] || ''; // 대표 사진 = 첫 번째
        console.log('[instructor] 저장할 사진 목록:', photoUrls);

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
                photo_urls: photoUrls,
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

    /* ── 페이지 렌더 ── */
    async render() {
        document.getElementById('pageContent').innerHTML = `
            <div class="page-header">
                <h2><i class="fas fa-calendar-alt"></i> 커리큘럼 관리</h2>
                <div style="display:flex;gap:8px;">
                    <button class="btn-secondary btn-sm" onclick="curricula.showAutoForm()">
                        <i class="fas fa-magic"></i> 자동 생성
                    </button>
                    <button class="btn-primary btn-sm" onclick="curricula.showForm()">
                        <i class="fas fa-plus"></i> 직접 등록
                    </button>
                </div>
            </div>
            <div id="curricList" class="data-list"><div class="loading-mini"><i class="fas fa-spinner fa-spin"></i></div></div>`;
        await this.load();
    },

    /* ── 목록 로드 ── */
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

    /* ══════════════════════════════════════════
       자동 생성 폼 — 템플릿 기반 Canvas 이미지
    ══════════════════════════════════════════ */
    showAutoForm() {
        const now = new Date();
        const DAYS = ['월요일','화요일','수요일','목요일','금요일'];
        const mkRows = (prefix) => DAYS.map((d,i) => `
            <div style="display:grid;grid-template-columns:72px 1fr;align-items:center;gap:6px;margin-bottom:5px;">
                <span style="font-size:13px;font-weight:600;color:#334155;">${d}</span>
                <input type="text" id="${prefix}_${i}" placeholder="예: 콤비리포머"
                    style="padding:5px 9px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;width:100%;">
            </div>`).join('');

        const body = `
<style>
.cu-tab-btn{padding:6px 16px;border:1px solid #d1d5db;border-radius:20px;font-size:13px;cursor:pointer;background:#f8fafc;color:#64748b;font-weight:600;transition:all .15s;}
.cu-tab-btn.active{background:#0f3460;color:#fff;border-color:#0f3460;}
</style>
<div style="display:flex;gap:12px;margin-bottom:14px;">
    <div class="form-group" style="flex:1"><label>년도</label><input type="number" id="cuAutoYear" value="${now.getFullYear()}" style="width:100%;"></div>
    <div class="form-group" style="flex:1"><label>월</label><input type="number" id="cuAutoMonth" min="1" max="12" value="${now.getMonth()+1}" style="width:100%;"></div>
</div>
<div class="form-group" style="margin-bottom:14px;">
    <label>템플릿 선택</label>
    <div style="display:flex;gap:8px;">
        <button class="cu-tab-btn active" onclick="curricula._selectTpl(this,'group')"><i class="fas fa-users"></i> 6:1 그룹</button>
        <button class="cu-tab-btn" onclick="curricula._selectTpl(this,'personal')"><i class="fas fa-user"></i> 개인/듀엣</button>
    </div>
</div>
<div id="tplGroup">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
        <div>
            <div style="font-size:12px;font-weight:700;color:#0f3460;margin-bottom:8px;padding:3px 10px;background:#e8f0fe;border-radius:6px;">🔵 홀수 주</div>
            ${mkRows('odd')}
        </div>
        <div>
            <div style="font-size:12px;font-weight:700;color:#2e8b57;margin-bottom:8px;padding:3px 10px;background:#e8f8f0;border-radius:6px;">🟢 짝수 주</div>
            ${mkRows('even')}
        </div>
    </div>
</div>
<div id="tplPersonal" style="display:none;">
    <div class="form-group">
        <label>수업 구성 설명</label>
        <textarea id="personalDesc" rows="3" placeholder="예: 수강생과 강사가 1:1로 일정을 직접 조율합니다." style="width:100%;resize:vertical;"></textarea>
    </div>
</div>
<button onclick="curricula._previewCanvas()" style="margin-top:12px;width:100%;padding:8px;background:#f1f5f9;border:1px dashed #94a3b8;border-radius:8px;font-size:13px;cursor:pointer;color:#475569;">
    <i class="fas fa-eye"></i> 미리보기 생성
</button>
<div id="cuPreviewWrap" style="display:none;margin-top:12px;text-align:center;">
    <canvas id="cuCanvas" style="max-width:100%;border-radius:10px;box-shadow:0 2px 12px rgba(0,0,0,.15);"></canvas>
    <p style="font-size:12px;color:#94a3b8;margin-top:6px;">이 이미지로 커리큘럼이 등록됩니다</p>
</div>`;

        const footer = `
            <button class="btn-secondary" onclick="closeGlobalModal()">취소</button>
            <button class="btn-primary" id="cuAutoSaveBtn" onclick="curricula.saveAuto()"><i class="fas fa-magic"></i> 생성 및 저장</button>`;
        openGlobalModal('커리큘럼 자동 생성', body, footer);
        setTimeout(() => {
            const box = document.querySelector('#globalModal .modal-box,#globalModal .modal-content,#globalModal [class*="modal-"]');
            if (box) box.style.maxWidth = '680px';
        }, 50);
    },

    _selectTpl(btn, type) {
        document.querySelectorAll('.cu-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tplGroup').style.display    = type === 'group'    ? '' : 'none';
        document.getElementById('tplPersonal').style.display = type === 'personal' ? '' : 'none';
    },

    _previewCanvas() {
        const isPersonal = document.getElementById('tplPersonal').style.display !== 'none';
        const year  = document.getElementById('cuAutoYear').value;
        const month = document.getElementById('cuAutoMonth').value;
        isPersonal ? this._drawPersonal(year, month) : this._drawGroup(year, month);
    },

    /* ── 6:1 그룹 Canvas 이미지 (참조 템플릿 재현) ── */
    _drawGroup(year, month) {
        const DAYS = ['월요일','화요일','수요일','목요일','금요일'];
        const oddVals  = DAYS.map((_,i) => document.getElementById(`odd_${i}`)?.value.trim()  || '—');
        const evenVals = DAYS.map((_,i) => document.getElementById(`even_${i}`)?.value.trim() || '—');

        const W = 1080, H = 1080;
        const canvas = document.getElementById('cuCanvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');

        /* ── 1. 배경: 딥그린 + 중앙 radial spotlight ── */
        ctx.fillStyle = '#0a2219'; ctx.fillRect(0,0,W,H);
        // 중앙 상단 부드러운 초록 spotlight
        const gSpot = ctx.createRadialGradient(W/2, 350, 30, W/2, 350, 560);
        gSpot.addColorStop(0,'rgba(20,80,45,0.55)');
        gSpot.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle = gSpot; ctx.fillRect(0,0,W,H);

        /* ── 2. 외곽 골드 이중 테두리 ── */
        ctx.strokeStyle='rgba(203,177,123,0.55)'; ctx.lineWidth=2.5; ctx.strokeRect(22,22,W-44,H-44);
        ctx.strokeStyle='rgba(203,177,123,0.22)'; ctx.lineWidth=1;   ctx.strokeRect(32,32,W-64,H-64);

        ctx.textAlign='center'; ctx.textBaseline='alphabetic';

        /* ── 3. PILATES STUDIO (상단 캡션) ── */
        ctx.letterSpacing = '8px';
        ctx.fillStyle='#cbb17b'; ctx.font='500 22px Georgia,serif';
        ctx.fillText('PILATES STUDIO', W/2, 82);
        ctx.letterSpacing = '0px';

        /* ── 4. 메인 타이틀 골드 그라데이션 ── */
        const tGrad = ctx.createLinearGradient(0, 100, 0, 180);
        tGrad.addColorStop(0,'#f5e090'); tGrad.addColorStop(0.5,'#e8c85a'); tGrad.addColorStop(1,'#c9a030');
        ctx.fillStyle = tGrad; ctx.font = 'bold 68px sans-serif';
        ctx.fillText('6:1 그룹 기구필라테스 커리큘럼', W/2, 172);

        /* ── 5. 골드 수평선 + 다이아몬드 ── */
        const lineY = 194;
        ctx.strokeStyle='rgba(203,177,123,0.55)'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(100,lineY); ctx.lineTo(W/2-18,lineY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(W/2+18,lineY); ctx.lineTo(W-100,lineY); ctx.stroke();
        // 다이아몬드
        ctx.fillStyle='#cbb17b';
        ctx.beginPath();
        ctx.moveTo(W/2,lineY-8); ctx.lineTo(W/2+10,lineY); ctx.lineTo(W/2,lineY+8); ctx.lineTo(W/2-10,lineY); ctx.closePath();
        ctx.fill();

        /* ── 6. 부제 ── */
        ctx.fillStyle='rgba(220,240,225,0.75)'; ctx.font='300 24px sans-serif';
        ctx.fillText('체계적인 커리큘럼으로 안전하고 효과적인 운동을 경험하세요.', W/2, 232);

        /* ── 7. 연·월 배지 ── */
        ctx.fillStyle='rgba(203,177,123,0.12)';
        _cuRoundRect(ctx, W/2-70, 244, 140, 30, 15); ctx.fill();
        ctx.strokeStyle='rgba(203,177,123,0.35)'; ctx.lineWidth=1;
        _cuRoundRect(ctx, W/2-70, 244, 140, 30, 15); ctx.stroke();
        ctx.fillStyle='#cbb17b'; ctx.font='500 16px sans-serif';
        ctx.fillText(`${year}년 ${month}월`, W/2, 263);

        /* ── 8. 테이블 ── */
        const tblY=292, rowH=62, colW=200;
        const oddX=50, evenX=W/2+30;
        const GAP=20; // 배지 아래 공간

        const drawTable = (sx, label, vals, isEven) => {
            const centerX = sx + colW;          // 테이블 중심 X
            const tblW    = colW * 2;

            // 배지
            ctx.font='bold 22px sans-serif';
            const lw = ctx.measureText(label).width + 48;
            const lx = centerX - lw/2;
            const bY = tblY - GAP - 36;
            if (isEven) {
                ctx.fillStyle = '#cbb17b';
            } else {
                ctx.fillStyle = 'rgba(203,177,123,0)';
                ctx.strokeStyle = '#cbb17b'; ctx.lineWidth = 1.5;
            }
            _cuRoundRect(ctx, lx, bY, lw, 34, 17);
            if (isEven) { ctx.fill(); ctx.fillStyle='#1a3828'; }
            else        { ctx.fill(); ctx.stroke(); ctx.fillStyle='#cbb17b'; }
            ctx.fillText(label, centerX, bY+23);

            // 헤더 행 (골드 배경)
            const hdrBg = isEven
                ? ctx.createLinearGradient(sx, tblY, sx, tblY+rowH)
                : null;
            if (hdrBg) {
                hdrBg.addColorStop(0,'rgba(203,177,123,0.55)');
                hdrBg.addColorStop(1,'rgba(175,148,88,0.45)');
                ctx.fillStyle = hdrBg;
            } else {
                ctx.fillStyle = 'rgba(203,177,123,0.15)';
            }
            _cuRoundRect(ctx, sx, tblY, tblW, rowH, [6,6,0,0]); ctx.fill();
            ctx.strokeStyle='rgba(203,177,123,0.5)'; ctx.lineWidth=1;
            ctx.strokeRect(sx, tblY, tblW, rowH);
            // 세로 구분선 (헤더)
            ctx.beginPath(); ctx.moveTo(sx+colW, tblY); ctx.lineTo(sx+colW, tblY+rowH); ctx.stroke();
            ctx.fillStyle = isEven ? '#1a3828' : '#cbb17b';
            ctx.font='bold 22px sans-serif';
            ctx.fillText('요일', sx+colW/2, tblY+rowH*0.65);
            ctx.fillText('수업',  sx+colW*1.5, tblY+rowH*0.65);

            // 데이터 행
            vals.forEach((v,i) => {
                const ry = tblY + rowH*(i+1);
                ctx.fillStyle = 'rgba(255,255,255,0.03)';
                ctx.fillRect(sx, ry, tblW, rowH);
                ctx.strokeStyle='rgba(203,177,123,0.22)'; ctx.lineWidth=0.8;
                ctx.strokeRect(sx, ry, tblW, rowH);
                ctx.beginPath(); ctx.moveTo(sx+colW,ry); ctx.lineTo(sx+colW,ry+rowH); ctx.stroke();
                ctx.fillStyle='rgba(220,235,225,0.88)'; ctx.font='400 21px sans-serif';
                ctx.fillText(DAYS[i], sx+colW/2, ry+rowH*0.65);
                ctx.fillStyle='#f0d870'; ctx.font='bold 22px sans-serif';
                ctx.fillText(v, sx+colW*1.5, ry+rowH*0.65);
            });

            // 테이블 외곽 라운드 테두리
            ctx.strokeStyle='rgba(203,177,123,0.55)'; ctx.lineWidth=1.5;
            _cuRoundRect(ctx, sx, tblY, tblW, rowH*(vals.length+1), [6,6,6,6]); ctx.stroke();
        };

        drawTable(oddX,  '홀수주', oddVals,  false);
        drawTable(evenX, '짝수주', evenVals, true);

        /* ── 9. 하단 구분선 ── */
        const botSectionY = tblY + rowH*6 + 18;
        ctx.strokeStyle='rgba(203,177,123,0.25)'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(40, botSectionY); ctx.lineTo(W-40, botSectionY); ctx.stroke();

        /* ── 10. 기구 일러스트 (Combo Reformer 좌 / Chair 우) ── */
        const drawEquipment = (cx, label, subLabel, isReformer) => {
            const ey = botSectionY + 18;
            const eH  = H - ey - 60;

            // spotlight 원
            const rGlow = ctx.createRadialGradient(cx, ey+eH*0.6, 10, cx, ey+eH*0.6, eH*0.55);
            rGlow.addColorStop(0,'rgba(30,90,55,0.45)');
            rGlow.addColorStop(1,'rgba(0,0,0,0)');
            ctx.fillStyle=rGlow; ctx.fillRect(cx-eH*0.6, ey, eH*1.2, eH);

            // 기구 실루엣 (단순 기하 도형으로 표현)
            ctx.save();
            ctx.translate(cx, ey + eH*0.52);

            if (isReformer) {
                // 콤비리포머 단순 실루엣
                const sc = eH * 0.0034;
                ctx.scale(sc, sc);
                ctx.fillStyle='rgba(203,177,123,0.35)';
                // 레일 바디
                _cuRoundRect(ctx, -200, -20, 400, 40, 8); ctx.fill();
                // 다리 4개
                [[-160,-20],[-100,-20],[100,-20],[160,-20]].forEach(([lx])=>{
                    ctx.fillRect(lx-8, 20, 16, 60);
                });
                // 숄더블록
                ctx.fillStyle='rgba(203,177,123,0.5)';
                _cuRoundRect(ctx, 140, -55, 60, 35, 6); ctx.fill();
                // 캐리지
                ctx.fillStyle='rgba(203,177,123,0.25)';
                _cuRoundRect(ctx, -80, -55, 130, 40, 5); ctx.fill();
                ctx.strokeStyle='rgba(203,177,123,0.6)'; ctx.lineWidth=4;
                _cuRoundRect(ctx, -200, -20, 400, 40, 8); ctx.stroke();
            } else {
                // 체어 단순 실루엣
                const sc = eH * 0.003;
                ctx.scale(sc, sc);
                ctx.fillStyle='rgba(203,177,123,0.35)';
                // 시트
                _cuRoundRect(ctx, -90, -80, 180, 40, 6); ctx.fill();
                // 몸통
                _cuRoundRect(ctx, -70, -40, 140, 80, 4); ctx.fill();
                // 다리 4개
                [[-60, 40],[60, 40]].forEach(([lx,ly])=>{
                    ctx.fillRect(lx-8, ly, 16, 55);
                });
                // 핸들 (폴)
                ctx.fillStyle='rgba(203,177,123,0.55)';
                ctx.fillRect(-8, -160, 16, 80);
                ctx.fillRect(-30, -175, 60, 16);
                ctx.strokeStyle='rgba(203,177,123,0.6)'; ctx.lineWidth=4;
                _cuRoundRect(ctx, -90, -80, 180, 40, 6); ctx.stroke();
            }
            ctx.restore();

            // 기구 이름 (이탤릭 골드)
            ctx.fillStyle='#d4b870'; ctx.font='italic bold 26px Georgia,serif';
            ctx.fillText(label, cx, ey+eH*0.88);
            // 설명 텍스트
            ctx.fillStyle='rgba(200,220,210,0.65)'; ctx.font='300 18px sans-serif';
            ctx.fillText(subLabel, cx, ey+eH*0.97);
        };

        drawEquipment(W*0.25, 'Combo Reformer', '전신을 조화롭게 단련하는 대표 기구', true);
        drawEquipment(W*0.75, 'Chair',           '코어 강화와 균형 향상에 효과적인 기구', false);

        /* ── 11. 중앙 S 방패 로고 ── */
        const logoX = W/2, logoY2 = botSectionY + 30;
        const lSz = 52;
        // 방패 형태
        ctx.fillStyle='rgba(203,177,123,0.15)';
        ctx.beginPath();
        ctx.moveTo(logoX, logoY2+lSz*1.3);
        ctx.lineTo(logoX-lSz*0.8, logoY2+lSz*0.6);
        ctx.lineTo(logoX-lSz*0.8, logoY2-lSz*0.15);
        ctx.arcTo(logoX-lSz*0.8, logoY2-lSz*0.5, logoX, logoY2-lSz*0.5, lSz*0.4);
        ctx.arcTo(logoX+lSz*0.8, logoY2-lSz*0.5, logoX+lSz*0.8, logoY2-lSz*0.15, lSz*0.4);
        ctx.lineTo(logoX+lSz*0.8, logoY2+lSz*0.6);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle='rgba(203,177,123,0.7)'; ctx.lineWidth=1.5;
        ctx.stroke();
        // S 텍스트
        ctx.fillStyle='#d4b870'; ctx.font='bold 44px Georgia,serif';
        ctx.fillText('S', logoX, logoY2+lSz*0.55);

        document.getElementById('cuPreviewWrap').style.display='';
    },

    /* ── 개인/듀엣 Canvas 이미지 ── */
    _drawPersonal(year, month) {
        const desc = document.getElementById('personalDesc')?.value.trim() || '수강생과 강사가 직접 일정을 조율합니다.';
        const W=1080, H=720;
        const canvas = document.getElementById('cuCanvas');
        canvas.width=W; canvas.height=H;
        const ctx=canvas.getContext('2d');

        const bg=ctx.createLinearGradient(0,0,0,H);
        bg.addColorStop(0,'#0d1f3c'); bg.addColorStop(1,'#061228');
        ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
        ctx.strokeStyle='rgba(226,185,110,0.3)'; ctx.lineWidth=2; ctx.strokeRect(20,20,W-40,H-40);
        ctx.textAlign='center';

        ctx.fillStyle='#c9a84c'; ctx.font='600 22px Georgia,serif';
        ctx.fillText('PILATES STUDIO', W/2, 70);
        ctx.fillStyle='#f0d080'; ctx.font='bold 56px sans-serif';
        ctx.fillText('개인 / 듀엣 레슨', W/2, 150);
        ctx.fillStyle='rgba(255,255,255,0.6)'; ctx.font='300 22px sans-serif';
        ctx.fillText('상시 접수 · 강사와 1:1 일정 조율', W/2, 192);

        ctx.strokeStyle='rgba(226,185,110,0.45)'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(180,216); ctx.lineTo(W-180,216); ctx.stroke();

        ctx.fillStyle='rgba(255,255,255,0.82)'; ctx.font='400 24px sans-serif';
        const lines=_cuWrapText(ctx,desc,W-180); let ly=256;
        lines.forEach(l=>{ ctx.fillText(l,W/2,ly); ly+=40; });

        const boxY=Math.max(ly+20,360);
        const items=[['개인 레슨 (1:1)','440,000원 / 월'],['듀엣 레슨 (2:1)','280,000원 / 월']];
        items.forEach((it,i)=>{
            const bx=W/2-280+i*300, by=boxY;
            ctx.fillStyle='rgba(226,185,110,0.12)';
            _cuRoundRect(ctx,bx,by,260,90,12); ctx.fill();
            ctx.strokeStyle='rgba(226,185,110,0.4)'; ctx.lineWidth=1;
            _cuRoundRect(ctx,bx,by,260,90,12); ctx.stroke();
            ctx.fillStyle='#e2b96e'; ctx.font='bold 21px sans-serif';
            ctx.fillText(it[0],bx+130,by+34);
            ctx.fillStyle='#f0d080'; ctx.font='bold 27px sans-serif';
            ctx.fillText(it[1],bx+130,by+66);
        });

        ctx.fillStyle='rgba(255,255,255,0.2)'; ctx.font='300 17px sans-serif';
        ctx.fillText(`${year}년 ${month}월`,W/2,H-26);
        document.getElementById('cuPreviewWrap').style.display='';
    },

    /* ── Canvas → 업로드 → DB 저장 ── */
    async saveAuto() {
        const btn = document.getElementById('cuAutoSaveBtn');
        if (btn) { btn.disabled=true; btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> 저장 중...'; }
        try {
            if (!document.getElementById('cuPreviewWrap') || document.getElementById('cuPreviewWrap').style.display==='none') {
                this._previewCanvas();
                await new Promise(r=>setTimeout(r,100));
            }
            const canvas = document.getElementById('cuCanvas');
            if (!canvas) throw new Error('캔버스 없음');
            const year  = parseInt(document.getElementById('cuAutoYear').value);
            const month = parseInt(document.getElementById('cuAutoMonth').value);
            const blob  = await new Promise(r=>canvas.toBlob(r,'image/jpeg',0.92));
            const file  = new File([blob],`curriculum_${year}_${month}.jpg`,{type:'image/jpeg'});
            const fd=new FormData(); fd.append('image',file);
            const upRes = await fetch(window.location.origin+'/api/upload/image',{method:'POST',body:fd});
            const upJson= await upRes.json();
            if (!upRes.ok||!upJson.success) throw new Error(upJson.error||'이미지 업로드 실패');

            const isPersonal = document.getElementById('tplPersonal').style.display!=='none';
            const DAYS=['월요일','화요일','수요일','목요일','금요일'];
            const title = isPersonal
                ? `${year}년 ${month}월 개인/듀엣 레슨 커리큘럼`
                : `${year}년 ${month}월 6:1 그룹 기구필라테스 커리큘럼`;
            let content='';
            if (!isPersonal) {
                content='【홀수주】\n'+DAYS.map((d,i)=>`${d}: ${document.getElementById(`odd_${i}`)?.value||''}`).join('\n')
                       +'\n\n【짝수주】\n'+DAYS.map((d,i)=>`${d}: ${document.getElementById(`even_${i}`)?.value||''}`).join('\n');
            } else {
                content=document.getElementById('personalDesc')?.value||'';
            }

            const payload={year,month,title,content,image_url:upJson.url};
            const complexId=getEffectiveComplexId();
            const doSave=async(cxId)=>{
                await API.curricula.create({complex_id:cxId,...payload});
                closeGlobalModal();
                showToast('커리큘럼이 생성되었습니다 ✨');
                await curricula.load();
            };
            if (!complexId){ pickComplexForCreate(doSave); if(btn){btn.disabled=false;btn.innerHTML='<i class="fas fa-magic"></i> 생성 및 저장';} return; }
            await doSave(complexId);
        } catch(e) {
            console.error('[curricula] saveAuto 오류:',e);
            if(btn){btn.disabled=false;btn.innerHTML='<i class="fas fa-magic"></i> 생성 및 저장';}
            showToast('저장 실패: '+e.message,'error');
        }
    },

    /* ══════════════════════════
       직접 등록 / 수정 폼
    ══════════════════════════ */
    showForm(id) {
        const cu = id ? this.data.find(x=>x.id===id) : null;
        const now = new Date();
        const body=`
            <div class="form-row">
                <div class="form-group"><label>년도</label><input type="number" id="cuYear" value="${cu?.year||now.getFullYear()}"></div>
                <div class="form-group"><label>월</label><input type="number" id="cuMonth" min="1" max="12" value="${cu?.month||(now.getMonth()+1)}"></div>
            </div>
            <div class="form-group"><label>제목</label><input type="text" id="cuTitle" value="${cu?escHtml(cu.title||''):''}"></div>
            <div class="form-group"><label>내용</label><textarea id="cuContent" rows="4">${cu?escHtml(cu.content||''):''}</textarea></div>
            <div class="form-group">
                <label>이미지 URL</label>
                <input type="text" id="cuImage" value="${cu?escHtml(cu.image_url||''):''}" placeholder="https://...">
                <small>또는 파일 업로드:</small>
                <input type="file" id="cuImageFile" accept="image/*">
            </div>`;
        const footer=`
            <button class="btn-secondary" onclick="closeGlobalModal()">취소</button>
            <button class="btn-primary" onclick="curricula.save('${id||''}')"><i class="fas fa-save"></i> 저장</button>`;
        openGlobalModal(cu?'커리큘럼 수정':'커리큘럼 직접 등록',body,footer);
    },
    async save(id) {
        const saveBtn=document.querySelector('#globalModal .btn-primary');
        if(saveBtn){saveBtn.disabled=true;saveBtn.innerHTML='<i class="fas fa-spinner fa-spin"></i> 저장 중...';}
        let imageUrl=document.getElementById('cuImage').value.trim();
        const fileInput=document.getElementById('cuImageFile');
        if(fileInput&&fileInput.files&&fileInput.files[0]){
            try{
                const origFile=fileInput.files[0];
                const blob=await instructors._resizeImage(origFile);
                const uploadFile=blob?new File([blob],'image.jpg',{type:'image/jpeg'}):origFile;
                const fd=new FormData();fd.append('image',uploadFile);
                const res=await fetch(window.location.origin+'/api/upload/image',{method:'POST',body:fd});
                const result=await res.json().catch(()=>({success:false,error:'HTTP '+res.status}));
                if(res.ok&&result.success&&result.url){imageUrl=result.url;}
                else throw new Error(result.error||'HTTP '+res.status);
            }catch(e){
                if(saveBtn){saveBtn.disabled=false;saveBtn.innerHTML='<i class="fas fa-save"></i> 저장';}
                showToast('이미지 업로드 실패: '+e.message,'error'); return;
            }
        }
        try{
            const formData={
                year:parseInt(document.getElementById('cuYear').value),
                month:parseInt(document.getElementById('cuMonth').value),
                title:document.getElementById('cuTitle').value,
                content:document.getElementById('cuContent').value,
                image_url:imageUrl
            };
            if(id){
                await API.curricula.update(id,formData);
                closeGlobalModal();showToast('저장되었습니다');await this.load();
            }else{
                const complexId=getEffectiveComplexId();
                if(!complexId){
                    pickComplexForCreate(async(cxId)=>{
                        try{await API.curricula.create({complex_id:cxId,...formData});closeGlobalModal();showToast('저장되었습니다');await curricula.load();}
                        catch(e){showToast('저장 실패: '+e.message,'error');}
                    });
                    if(saveBtn){saveBtn.disabled=false;saveBtn.innerHTML='<i class="fas fa-save"></i> 저장';}
                    return;
                }
                await API.curricula.create({complex_id:complexId,...formData});
                closeGlobalModal();showToast('저장되었습니다');await this.load();
            }
        }catch(e){
            if(saveBtn){saveBtn.disabled=false;saveBtn.innerHTML='<i class="fas fa-save"></i> 저장';}
            showToast('저장 실패: '+e.message,'error');
        }
    },
    deleteItem(id){
        showConfirm('삭제 확인','커리큘럼을 삭제하시겠습니까?',async()=>{
            try{await API.curricula.delete(id);showToast('삭제되었습니다');await this.load();}
            catch(e){showToast('삭제 실패: '+e.message,'error');}
        });
    }
};

/* ── Canvas 전역 유틸 ── */
// r: 단일 숫자 또는 [tl,tr,br,bl] 배열
function _cuRoundRect(ctx,x,y,w,h,r){
    const [tl,tr,br,bl] = Array.isArray(r) ? r : [r,r,r,r];
    ctx.beginPath();
    ctx.moveTo(x+tl,y); ctx.lineTo(x+w-tr,y); ctx.arcTo(x+w,y,x+w,y+tr,tr);
    ctx.lineTo(x+w,y+h-br); ctx.arcTo(x+w,y+h,x+w-br,y+h,br);
    ctx.lineTo(x+bl,y+h); ctx.arcTo(x,y+h,x,y+h-bl,bl);
    ctx.lineTo(x,y+tl); ctx.arcTo(x,y,x+tl,y,tl);
    ctx.closePath();
}
function _cuWrapText(ctx,text,maxW){
    const words=text.split(' ');const lines=[];let cur='';
    for(const w of words){const t=cur?cur+' '+w:w;if(ctx.measureText(t).width>maxW){if(cur)lines.push(cur);cur=w;}else cur=t;}
    if(cur)lines.push(cur);return lines;
}

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
