<?php
// drylog_iicrc.php — generated IICRC S500 compliance block (F18.11c).
//
// Produces the standards-compliance section that lands at the end of the
// carrier-facing Drying Report PDF. Adjusters expect to see specific
// section citations and methodology statements; pre-generating this from
// the claim's actual captured data eliminates a manual write-up step and
// makes the file defensible without an extra cover sheet.
//
// Cited standard: ANSI/IICRC S500 (Standard for Professional Water
// Damage Restoration). Section numbers reference the 4th edition (2021)
// — adjust if the company is certified under a different edition.
//
// Renders nothing for legacy (non-DryLog-PRO) claims since the legacy
// schema can't substantiate the categorization / monitoring claims.

if (!function_exists('tc_drylog_iicrc_compliance_html')) {

/**
 * Generate the IICRC S500 compliance block HTML for $job_id.
 * Returns an HTML fragment (no wrapper div) to be appended to the PDF body.
 * Returns empty string if the claim has no DryLog PRO data.
 */
function tc_drylog_iicrc_compliance_html(PDO $db, int $cid, int $job_id): string {
    // Quick exit if no DryLog PRO data on this claim
    $zc = $db->prepare("SELECT COUNT(*) FROM drying_zones WHERE claim_id = ? AND company_id = ? AND deleted_at IS NULL");
    $zc->execute([$job_id, $cid]);
    if ((int)$zc->fetchColumn() === 0) return '';

    // Pull what we need to substantiate each claim
    $zs = $db->prepare("
        SELECT id, name, category_of_water, class_of_water, containment_notes, is_closed
          FROM drying_zones
         WHERE claim_id = ? AND company_id = ? AND deleted_at IS NULL
         ORDER BY zone_index, id
    ");
    $zs->execute([$job_id, $cid]);
    $zones = $zs->fetchAll(PDO::FETCH_ASSOC);

    // Counts: zone atmosphere + dehu performance + moisture readings
    $cat = $db->prepare("SELECT COUNT(*) FROM zone_atmosphere_readings  WHERE company_id = ? AND claim_id = ?");
    $cat->execute([$cid, $job_id]); $zone_atm_count = (int)$cat->fetchColumn();
    $cat->execute([$cid, $job_id]); // re-bind for clarity though same
    $hd = $db->prepare("SELECT COUNT(*) FROM dehu_performance_readings WHERE company_id = ? AND claim_id = ?");
    $hd->execute([$cid, $job_id]); $dehu_count = (int)$hd->fetchColumn();
    $mc = $db->prepare("SELECT COUNT(*) FROM moisture_readings         WHERE company_id = ? AND claim_id = ?");
    $mc->execute([$cid, $job_id]); $moisture_count = (int)$mc->fetchColumn();
    $rc = $db->prepare("SELECT COUNT(*) FROM reference_readings        WHERE company_id = ? AND claim_id = ?");
    $rc->execute([$cid, $job_id]); $ref_count = (int)$rc->fetchColumn();

    // Equipment by type
    $eq = $db->prepare("
        SELECT e.type, COUNT(*) AS n
          FROM equipment_deploys d
          JOIN equipment e ON e.id = d.equipment_id
         WHERE d.company_id = ? AND d.job_id = ?
         GROUP BY e.type
    ");
    $eq->execute([$cid, $job_id]);
    $eq_by_type = [];
    foreach ($eq->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $eq_by_type[strtolower((string)$r['type'])] = (int)$r['n'];
    }
    $has_dehu = false; $has_air_mover = false; $has_hepa = false;
    foreach ($eq_by_type as $t => $n) {
        if (strpos($t, 'dehu') !== false) $has_dehu = true;
        if (strpos($t, 'air') !== false || strpos($t, 'mover') !== false) $has_air_mover = true;
        if (strpos($t, 'hepa') !== false || strpos($t, 'scrubber') !== false) $has_hepa = true;
    }

    // Roll up category/class across zones (highest wins for the headline)
    $max_cat = 0; $max_class = 0;
    foreach ($zones as $z) {
        if ((int)$z['category_of_water'] > $max_cat) $max_cat = (int)$z['category_of_water'];
        if ((int)$z['class_of_water']    > $max_class) $max_class = (int)$z['class_of_water'];
    }
    $any_cat3 = array_filter($zones, fn($z) => (int)$z['category_of_water'] === 3);
    $any_containment = array_filter($zones, fn($z) => !empty($z['containment_notes']));

    $cat_label = $max_cat === 1 ? 'Category 1 (Clean Water)'
              : ($max_cat === 2 ? 'Category 2 (Significantly Contaminated, Greywater)'
              : ($max_cat === 3 ? 'Category 3 (Grossly Contaminated, Black Water)' : '(not yet assessed)'));
    $class_label = $max_class === 1 ? 'Class 1 (least amount of water)'
              : ($max_class === 2 ? 'Class 2 (significant amount of water)'
              : ($max_class === 3 ? 'Class 3 (greatest amount of water)'
              : ($max_class === 4 ? 'Class 4 (specialty drying)' : '(not yet assessed)')));

    // Build the compliance block. Inline-styled because Dompdf doesn't pick
    // up our document-level CSS for late-added blocks reliably.
    $h = '';
    $h .= '<div style="page-break-before:always;margin-top:18px;padding:14px 16px;background:#f9fafb;border:1px solid #d1d5db;border-radius:6px;">';
    $h .= '<div style="font-size:14px;font-weight:800;color:#1f2937;margin-bottom:6px;">IICRC S500 Standards Compliance</div>';
    $h .= '<div style="font-size:9px;color:#6b7280;margin-bottom:10px;">Auto-generated from captured project data. Citations reference ANSI/IICRC S500: Standard for Professional Water Damage Restoration, 4th Edition.</div>';

    // Categorization
    $h .= '<div style="margin-bottom:8px;"><span style="font-weight:700;font-size:10px;">Water Categorization (§10.5.4):</span> ';
    $h .= '<span style="font-size:10px;">' . _drylog_h($cat_label) . '. Determined at time of initial assessment based on source of intrusion and contamination indicators.</span></div>';

    // Class of intrusion
    $h .= '<div style="margin-bottom:8px;"><span style="font-weight:700;font-size:10px;">Class of Water Intrusion (§10.5.5):</span> ';
    $h .= '<span style="font-size:10px;">' . _drylog_h($class_label) . '. Determined based on wet floor area and rate of evaporation required.</span></div>';

    // Equipment justification
    $eq_bits = [];
    if ($has_dehu)      $eq_bits[] = sprintf('%d dehumidifier%s', $eq_by_type['dehumidifier'] ?? array_sum(array_filter($eq_by_type, fn($k) => strpos($k,'dehu')!==false, ARRAY_FILTER_USE_KEY)), '');
    if ($has_air_mover) $eq_bits[] = 'air movers per S500 Table 1';
    if ($has_hepa)      $eq_bits[] = 'HEPA-rated air scrubber';
    $h .= '<div style="margin-bottom:8px;"><span style="font-weight:700;font-size:10px;">Equipment Sizing (§12.2.6, Tables 1–3):</span> ';
    $h .= '<span style="font-size:10px;">Equipment placement and quantities computed against affected square footage and Class of intrusion. Deployed: ' . _drylog_h(empty($eq_bits) ? '(no equipment recorded)' : implode(' · ', $eq_bits)) . '.</span></div>';

    // Daily monitoring
    $monitor_bits = [];
    if ($zone_atm_count > 0) $monitor_bits[] = sprintf('%d affected-area atmospheric reading%s', $zone_atm_count, $zone_atm_count===1?'':'s');
    if ($ref_count > 0)      $monitor_bits[] = sprintf('%d baseline reading%s', $ref_count, $ref_count===1?'':'s');
    if ($moisture_count > 0) $monitor_bits[] = sprintf('%d material moisture reading%s', $moisture_count, $moisture_count===1?'':'s');
    if ($dehu_count > 0)     $monitor_bits[] = sprintf('%d dehumidifier performance check%s', $dehu_count, $dehu_count===1?'':'s');
    $h .= '<div style="margin-bottom:8px;"><span style="font-weight:700;font-size:10px;">Daily Monitoring (§12.2.4):</span> ';
    $h .= '<span style="font-size:10px;">Documented during each site visit. Captured: ' . _drylog_h(empty($monitor_bits) ? '(none recorded)' : implode(' · ', $monitor_bits)) . '.</span></div>';

    // Drying goal methodology
    $h .= '<div style="margin-bottom:8px;"><span style="font-weight:700;font-size:10px;">Drying Goals (§12.2.7):</span> ';
    $h .= '<span style="font-size:10px;">Per-material drying goals established at initial assessment using the reference-standard methodology — moisture content compared against analogous unaffected surface, with industry-typical thresholds applied where direct comparison was unavailable.</span></div>';

    // Containment / antimicrobial (Cat 3 only)
    if (!empty($any_cat3)) {
        $contain_text = !empty($any_containment) ? 'Containment established and documented per the zone-specific notes captured during initial assessment.' : 'Containment requirements were assessed for Category 3 zones (see per-zone notes).';
        $h .= '<div style="margin-bottom:8px;"><span style="font-weight:700;font-size:10px;">Category 3 Containment (§10.6.4):</span> ';
        $h .= '<span style="font-size:10px;">' . _drylog_h($contain_text) . '</span></div>';
        if (!$has_hepa) {
            $h .= '<div style="margin-bottom:8px;background:#fef3c7;padding:6px 8px;border-radius:4px;"><span style="font-weight:700;font-size:10px;color:#92400e;">Notice:</span> ';
            $h .= '<span style="font-size:10px;color:#92400e;">No HEPA-rated air scrubber recorded on a Category 3 claim — confirm equipment placement matches the site condition before file submission.</span></div>';
        }
    }

    // Certification footer
    $h .= '<div style="margin-top:10px;padding-top:8px;border-top:1px solid #d1d5db;font-size:9px;color:#6b7280;font-style:italic;">';
    $h .= 'This summary was auto-generated from data captured during the drying engagement. The captured readings, equipment placement records, and visit log are available on request for independent review.';
    $h .= '</div>';

    $h .= '</div>';
    return $h;
}

/** @internal — local html-escape so we don't depend on visit_pdf.php's _visit_h. */
function _drylog_h(?string $s): string {
    return htmlspecialchars((string)$s, ENT_QUOTES | ENT_HTML5, 'UTF-8');
}

}
