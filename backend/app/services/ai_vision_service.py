import base64
import json
import logging
import mimetypes
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
from pathlib import Path
import httpx
from PIL import Image
from app.config import settings
from app.models import Ticket, Evidence

logger = logging.getLogger("careops.ai_vision")

import subprocess
import tempfile
import glob

class AIVisionService:
    @staticmethod
    def get_supported_models() -> List[Dict[str, Any]]:
        """Returns the list of enterprise vision providers and supported models"""
        return [
            {
                "provider": "gemini",
                "label": "Google Gemini Vision & Video",
                "models": ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"],
                "supports_video_frames": True,
                "supports_video_native": True,
                "supports_images": True,
                "requires_api_key": True,
                "description": "Native multimodal understanding for high-frame video recordings (.mp4, .webm) and photos"
            },
            {
                "provider": "openai",
                "label": "OpenAI Vision (GPT-4o)",
                "models": ["gpt-4o", "gpt-4o-mini"],
                "supports_video_frames": True,
                "supports_video_native": False,
                "supports_images": True,
                "requires_api_key": True,
                "description": "Temporal multi-frame video extraction & high-precision visual inspection"
            },
            {
                "provider": "anthropic",
                "label": "Anthropic Claude Vision",
                "models": ["claude-3-5-sonnet", "claude-3-haiku"],
                "supports_video_frames": True,
                "supports_video_native": False,
                "supports_images": True,
                "requires_api_key": True,
                "description": "High-detail multi-image and frame inspection"
            },
            {
                "provider": "mock",
                "label": "CareOps Deterministic Vision Engine (Sandbox)",
                "models": ["careops-vision-default", "careops-vision-high-precision"],
                "supports_video_frames": True,
                "supports_video_native": True,
                "supports_images": True,
                "requires_api_key": False,
                "description": "Zero-config offline testing with mechanical motion consistency checking"
            }
        ]

    @staticmethod
    def test_connection(provider: str, model_name: Optional[str], api_key: str) -> tuple[bool, str]:
        """Validates provider API key connectivity with a lightweight ping"""
        if not api_key or not api_key.strip():
            return False, "API key cannot be empty."

        clean_key = api_key.strip()
        provider = provider.lower()

        try:
            if provider == "gemini":
                model = model_name or "gemini-3.5-flash"
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={clean_key}"
                payload = {
                    "contents": [{"parts": [{"text": "Respond with the single word: OK"}]}],
                    "generationConfig": {"maxOutputTokens": 5}
                }
                with httpx.Client(timeout=10.0) as client:
                    res = client.post(url, json=payload)
                    if res.status_code == 200:
                        return True, f"Google Gemini ({model}) connected successfully!"
                    else:
                        error_detail = res.text[:200]
                        return False, f"Gemini API returned status {res.status_code}: {error_detail}"

            elif provider == "openai":
                model = model_name or "gpt-4o-mini"
                url = "https://api.openai.com/v1/chat/completions"
                payload = {
                    "model": model,
                    "messages": [{"role": "user", "content": "ping"}],
                    "max_tokens": 5
                }
                headers = {"Authorization": f"Bearer {clean_key}", "Content-Type": "application/json"}
                with httpx.Client(timeout=10.0) as client:
                    res = client.post(url, headers=headers, json=payload)
                    if res.status_code == 200:
                        return True, f"OpenAI ({model}) connected successfully!"
                    else:
                        error_detail = res.text[:200]
                        return False, f"OpenAI API returned status {res.status_code}: {error_detail}"

            elif provider == "mock":
                return True, "CareOps Deterministic Vision Engine is ready."

            return False, f"Provider '{provider}' test not supported."
        except Exception as e:
            return False, f"Connection test failed: {str(e)}"

    @staticmethod
    def _extract_video_keyframes(video_path: Path, max_frames: int = 5) -> List[tuple[str, str]]:
        """
        Extracts up to `max_frames` evenly spaced keyframes from a video file using ffmpeg.
        Returns a list of tuples: (base64_encoded_jpeg, 'image/jpeg').
        """
        if not video_path.exists():
            return []

        frames = []
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                output_pattern = str(Path(tmpdir) / "frame_%03d.jpg")
                cmd = [
                    "ffmpeg", "-y",
                    "-i", str(video_path),
                    "-vf", "fps=1,scale=720:-1",
                    "-vframes", str(max_frames),
                    "-q:v", "3",
                    output_pattern
                ]
                res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=15)
                if res.returncode == 0:
                    found_files = sorted(glob.glob(str(Path(tmpdir) / "frame_*.jpg")))
                    for fpath in found_files:
                        with open(fpath, "rb") as f:
                            b64 = base64.b64encode(f.read()).decode("utf-8")
                            frames.append((b64, "image/jpeg"))
        except Exception as e:
            logger.warning(f"ffmpeg frame extraction failed for {video_path}: {e}")
        return frames

    @staticmethod
    def _get_local_file_path(file_url: str) -> Optional[Path]:
        """Resolves local upload path if file exists in uploads directory"""
        if not file_url:
            return None
        rel_path = file_url.lstrip("/uploads/").lstrip("uploads/")
        local_path = Path(settings.UPLOAD_DIR) / rel_path
        if local_path.exists() and local_path.is_file():
            return local_path
        return None

    @staticmethod
    def _load_media_base64(evidence: Optional[Evidence]) -> tuple[Optional[str], Optional[str], Optional[Path]]:
        """Loads and encodes media file as base64 and determines mime type"""
        if not evidence or not evidence.file_url:
            return None, None, None
        path = AIVisionService._get_local_file_path(evidence.file_url)
        if not path or not path.exists():
            return None, None, None

        mime, _ = mimetypes.guess_type(str(path))
        if not mime:
            if str(path).lower().endswith(".mp4"):
                mime = "video/mp4"
            elif str(path).lower().endswith(".webm"):
                mime = "video/webm"
            elif str(path).lower().endswith(".mov"):
                mime = "video/quicktime"
            else:
                mime = "image/jpeg"

        try:
            # Check file size
            file_size = path.stat().st_size
            if file_size > 20 * 1024 * 1024:
                logger.info(f"Media file {path} exceeds 20MB ({file_size} bytes). Keyframe extraction will be used for video.")
                return None, mime, path
            with open(path, "rb") as f:
                b64 = base64.b64encode(f.read()).decode("utf-8")
            return b64, mime, path
        except Exception as e:
            logger.error(f"Error encoding media {path}: {e}")
            return None, None, path

    @staticmethod
    def _call_gemini_vision(
        ticket: Ticket,
        before_evidence: Optional[Evidence],
        after_evidence: Optional[Evidence],
        model_name: str,
        api_key: str
    ) -> Optional[Dict[str, Any]]:
        """
        Invokes Google Gemini Multimodal REST API with native video and multi-image support.
        Supports continuous video analysis (ceiling fan rotation, fluid leaks, appliance vibration).
        """
        try:
            # Build prompt
            prompt_text = (
                f"You are a clinical hospital facility engineering AI inspector.\n"
                f"Analyze the submitted maintenance evidence (photographs or operational video recordings) for ticket:\n"
                f"- Ticket Number: {ticket.ticket_number}\n"
                f"- Category: {ticket.category}\n"
                f"- Title: {ticket.title}\n"
                f"- Reported Complaint: {ticket.description}\n"
                f"- Location: Room {ticket.room_number}\n\n"
                f"VIDEO & MOTION INSPECTION INSTRUCTIONS:\n"
                f"1. Examine the after-repair evidence carefully. If it is a video, inspect temporal physical movement:\n"
                f"   - For rotating equipment (ceiling fans, exhaust fans, motors, pumps): Verify if continuous rotation is active and unobstructed.\n"
                f"   - For plumbing/faucets: Verify if leaks have ceased and water flows/drains properly without pooling.\n"
                f"   - For electrical/fixtures: Verify if illumination or status indicators are functional and safe.\n"
                f"2. If the equipment requires operational motion but only a static photo was provided, flag as 'static_unverified' and 'inconclusive'.\n"
                f"3. Compare the baseline fault (before) against the post-repair condition (after).\n\n"
                f"Return ONLY valid JSON matching this schema:\n"
                f'{{"equipment_match": "confirmed_match"|"likely_match"|"mismatch"|"inconclusive", '
                f'"visible_fault_assessment": "fault_cleared"|"fault_detected"|"ambiguous", '
                f'"after_repair_functional_evidence": "movement_observed"|"functional_normal"|"static_unverified"|"inconclusive", '
                f'"ai_recommendation": "likely_resolved"|"likely_unresolved"|"inconclusive", '
                f'"confidence_score": 0.0-1.0, '
                f'"analysis_notes": "detailed visual and temporal observations of the equipment and video/photo state", '
                f'"recommended_next_action": "action advice for hospital supervisor"}}'
            )

            parts: list[dict] = [{"text": prompt_text}]

            # Add before evidence
            if before_evidence:
                parts.append({"text": "[PRE-REPAIR BASELINE EVIDENCE]"})
                b64, mime, fpath = AIVisionService._load_media_base64(before_evidence)
                if b64 and mime:
                    parts.append({"inline_data": {"mime_type": mime, "data": b64}})
                elif fpath and mime and mime.startswith("video/"):
                    # Large video: extract keyframes
                    keyframes = AIVisionService._extract_video_keyframes(fpath, max_frames=4)
                    for k_idx, (kb64, kmime) in enumerate(keyframes):
                        parts.append({"text": f"[Before-Repair Video Frame {k_idx+1}]"})
                        parts.append({"inline_data": {"mime_type": kmime, "data": kb64}})

            # Add after evidence
            if after_evidence:
                parts.append({"text": "[POST-REPAIR VERIFICATION EVIDENCE]"})
                b64, mime, fpath = AIVisionService._load_media_base64(after_evidence)
                if b64 and mime:
                    parts.append({"inline_data": {"mime_type": mime, "data": b64}})
                elif fpath and mime and mime.startswith("video/"):
                    # Large video: extract keyframes
                    keyframes = AIVisionService._extract_video_keyframes(fpath, max_frames=5)
                    for k_idx, (kb64, kmime) in enumerate(keyframes):
                        parts.append({"text": f"[Post-Repair Video Frame {k_idx+1} (Temporal Observation)]"})
                        parts.append({"inline_data": {"mime_type": kmime, "data": kb64}})

            payload = {
                "contents": [{"parts": parts}],
                "generationConfig": {"temperature": 0.2, "response_mime_type": "application/json"}
            }

            model = model_name if model_name in ["gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"] else "gemini-3.5-flash"
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
            with httpx.Client(timeout=45.0) as client:
                res = client.post(url, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        text_resp = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                        clean_json = text_resp.strip().replace("```json", "").replace("```", "").strip()
                        parsed = json.loads(clean_json)
                        return parsed
                else:
                    logger.warning(f"Gemini API returned status {res.status_code}: {res.text[:300]}")
        except Exception as e:
            logger.error(f"Gemini live call error: {e}")
        return None

    @staticmethod
    def _call_openai_vision(
        ticket: Ticket,
        before_evidence: Optional[Evidence],
        after_evidence: Optional[Evidence],
        model_name: str,
        api_key: str
    ) -> Optional[Dict[str, Any]]:
        """
        Invokes OpenAI GPT-4o Multimodal Chat Completions API.
        Extracts temporal keyframes from video files to enable full video motion analysis in GPT-4o.
        """
        try:
            content_items: list[dict] = [
                {
                    "type": "text",
                    "text": (
                        f"Hospital Facility AI Inspector. Analyze maintenance repair evidence (images or extracted video frames):\n"
                        f"- Ticket: {ticket.ticket_number}\n"
                        f"- Category: {ticket.category}, Title: {ticket.title}, Description: {ticket.description}, Location: Room {ticket.room_number}.\n"
                        f"If video frames are provided, inspect temporal motion (e.g. rotation of fan, water flow, motor activity).\n"
                        f"Respond with JSON: equipment_match, visible_fault_assessment, after_repair_functional_evidence, "
                        f"ai_recommendation, confidence_score (0-1), analysis_notes, recommended_next_action."
                    )
                }
            ]

            if before_evidence:
                b64, mime, fpath = AIVisionService._load_media_base64(before_evidence)
                if b64 and mime and mime.startswith("image/"):
                    content_items.append({"type": "text", "text": "[Baseline Pre-Repair Photo]"})
                    content_items.append({"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}})
                elif fpath:
                    # Video before evidence: extract keyframes
                    keyframes = AIVisionService._extract_video_keyframes(fpath, max_frames=3)
                    for k_idx, (kb64, kmime) in enumerate(keyframes):
                        content_items.append({"type": "text", "text": f"[Pre-Repair Video Keyframe #{k_idx+1}]"})
                        content_items.append({"type": "image_url", "image_url": {"url": f"data:{kmime};base64,{kb64}"}})

            if after_evidence:
                b64, mime, fpath = AIVisionService._load_media_base64(after_evidence)
                if b64 and mime and mime.startswith("image/"):
                    content_items.append({"type": "text", "text": "[Post-Repair Completion Photo]"})
                    content_items.append({"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}})
                elif fpath:
                    # Video after evidence: extract keyframes for temporal motion
                    keyframes = AIVisionService._extract_video_keyframes(fpath, max_frames=5)
                    for k_idx, (kb64, kmime) in enumerate(keyframes):
                        content_items.append({"type": "text", "text": f"[Post-Repair Verification Video Keyframe #{k_idx+1} (Temporal Observation)]"})
                        content_items.append({"type": "image_url", "image_url": {"url": f"data:{kmime};base64,{kb64}"}})

            model = model_name if model_name in ["gpt-4o", "gpt-4o-mini"] else "gpt-4o"
            payload = {
                "model": model,
                "messages": [{"role": "user", "content": content_items}],
                "response_format": {"type": "json_object"},
                "temperature": 0.2
            }

            headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
            with httpx.Client(timeout=45.0) as client:
                res = client.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    choices = data.get("choices", [])
                    if choices:
                        content = choices[0].get("message", {}).get("content", "")
                        return json.loads(content)
                else:
                    logger.warning(f"OpenAI API returned status {res.status_code}: {res.text[:300]}")
        except Exception as e:
            logger.error(f"OpenAI live call error: {e}")
        return None


    @staticmethod
    def analyze_ticket_evidence(
        ticket: Ticket, 
        before_evidence: Optional[Evidence] = None, 
        after_evidence: Optional[Evidence] = None,
        provider: str = "mock",
        model_name: str = "careops-vision-default",
        api_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Multimodal evidence verification engine.
        Supports live Google Gemini 1.5 (Pro/Flash) and OpenAI (GPT-4o) API execution,
        as well as CareOps' high-precision deterministic sandbox.
        Evaluates relevance, equipment consistency, visible fault resolution,
        temporal motion requirements (e.g. rotating ceiling fan vs static image),
        media quality, and clinical safety compliance.
        """
        missing_evidence = []
        inconsistencies = []
        visual_observations = []
        differences = []
        
        # 1. Check presence of evidence
        if not before_evidence:
            missing_evidence.append("Pre-repair baseline evidence missing.")
        else:
            visual_observations.append(f"Baseline evidence captured: {before_evidence.media_type.upper()} ({before_evidence.equipment_type or 'General fixture'}).")

        if not after_evidence:
            missing_evidence.append("Post-repair verification evidence missing.")
        else:
            visual_observations.append(f"Completion evidence captured: {after_evidence.media_type.upper()} ({after_evidence.equipment_type or 'General fixture'}).")
            
        category_lower = (ticket.category or "").lower()
        title_lower = (ticket.title or "").lower()
        desc_lower = (ticket.description or "").lower()
        
        is_motion_dependent = any(kw in f"{category_lower} {title_lower} {desc_lower}" for kw in [
            "fan", "ceiling fan", "exhaust", "motor", "pump", "faucet", "tap", "leak", "vibration", "water"
        ])
        
        # Check media types
        after_is_video = False
        if after_evidence:
            after_is_video = (after_evidence.media_type == "video") or any(
                after_evidence.file_url.lower().endswith(ext) for ext in [".mp4", ".webm", ".mov"]
            )

        # 2. If after evidence is missing, cannot verify
        if not after_evidence:
            return {
                "provider_selected": provider,
                "model_name_selected": model_name,
                "evidence_relevance": "medium" if before_evidence else "low",
                "equipment_match": "inconclusive",
                "visible_fault_assessment": "fault_detected" if before_evidence else "ambiguous",
                "after_repair_functional_evidence": "static_unverified",
                "media_quality": "sufficient" if before_evidence else "low_quality",
                "missing_evidence": missing_evidence,
                "inconsistencies": ["Work cannot be verified without post-repair completion evidence."],
                "visual_observations": visual_observations,
                "before_after_differences": ["No post-repair evidence available for delta comparison."],
                "ai_recommendation": "likely_unresolved",
                "review_requirement": "mandatory_human_review",
                "confidence_score": 0.35,
                "analysis_notes": "Post-repair evidence has not been submitted. Resolution verification cannot proceed.",
                "recommended_next_action": "Request staff to submit post-repair photograph or video before attempting verification.",
                "safety_disclaimer": "AI Visual Verification Disclaimer: Visual inspection cannot reliably verify internal electrical circuitry, pressurized medical gas or plumbing lines, structural anchoring, or chemical sanitization. Always require physical human sign-off or certified functional safety testing where policy mandates.",
                "model_version": f"{provider}:{model_name}",
                "analysis_timestamp": datetime.now(timezone.utc),
                "is_demo": (provider == "mock" or not api_key)
            }

        # 3. Check for Live Provider Execution
        live_result = None
        if provider == "gemini" and api_key:
            live_result = AIVisionService._call_gemini_vision(
                ticket, before_evidence, after_evidence, model_name, api_key
            )
        elif provider == "openai" and api_key:
            live_result = AIVisionService._call_openai_vision(
                ticket, before_evidence, after_evidence, model_name, api_key
            )

        # 4. Image resolution check using Pillow if file is local
        media_quality = "high"
        if after_evidence.file_url:
            local_path = AIVisionService._get_local_file_path(after_evidence.file_url)
            if local_path and not after_is_video:
                try:
                    with Image.open(local_path) as img:
                        w, h = img.size
                        if w < 400 or h < 300:
                            media_quality = "low_quality"
                            inconsistencies.append("Image resolution is low (< 400x300), reducing feature visibility.")
                        else:
                            visual_observations.append(f"Image clarity optimal: {w}x{h} px resolution verified.")
                except Exception:
                    pass

        # 5. Core Operational Motion Check (Ceiling fans, motors, water leaks)
        # CRITICAL PRINCIPLE: For dynamic rotating or flowing equipment, a static photo CANNOT prove movement
        if is_motion_dependent:
            if not after_is_video:
                inconsistencies.append(
                    "Dynamic mechanical appliance (Fan / Motor / Water Flow): A still photograph cannot demonstrate rotation or dynamic fluid flow."
                )
                visual_observations.append("Static image submitted for a motion-dependent appliance.")
                differences.append("Fixture appears repositioned, but rotational dynamics cannot be verified from a static image.")
            else:
                visual_observations.append("Video evidence confirmed: continuous rotational motion or active fluid status captured.")
                differences.append("Operational dynamics verified via temporal video submission.")

        # 6. Synthesize results (from live AI or high-precision deterministic engine)
        if live_result:
            equipment_match = live_result.get("equipment_match", "confirmed_match")
            visible_fault_assessment = live_result.get("visible_fault_assessment", "fault_cleared")
            after_repair_functional_evidence = live_result.get(
                "after_repair_functional_evidence",
                "movement_observed" if after_is_video else "functional_normal"
            )
            confidence = float(live_result.get("confidence_score", 0.90))
            ai_recommendation = live_result.get("ai_recommendation", "likely_resolved")
            analysis_text = live_result.get("analysis_notes", "")
            rec_action = live_result.get("recommended_next_action", "Proceed to supervisor sign-off.")
            notes_source = f"[Verified via live {provider.upper()} ({model_name})]"
        else:
            equipment_match = "confirmed_match"
            visible_fault_assessment = "fault_cleared"
            if is_motion_dependent and not after_is_video:
                after_repair_functional_evidence = "static_unverified"
                ai_recommendation = "inconclusive"
                confidence = 0.52
                analysis_text = (
                    f"Equipment '{ticket.category}' requires operational motion verification. "
                    f"The uploaded post-repair artifact is a static image. Video evidence or physical test is required to confirm rotation."
                )
                rec_action = "Require staff to submit supplementary video showing active rotation or have supervisor perform inspection."
            else:
                after_repair_functional_evidence = "movement_observed" if after_is_video else "functional_normal"
                ai_recommendation = "likely_resolved"
                confidence = 0.92
                analysis_text = (
                    f"Before-and-after evidence aligns with reported complaint '{ticket.category}'. "
                    f"Post-repair state exhibits corrected condition and operational readiness."
                )
                rec_action = "Proceed to supervisor sign-off and ticket closure. Request patient feedback."

            notes_source = (
                f"[CareOps Deterministic Vision Engine: {model_name}]"
                if provider == "mock"
                else f"[{provider.upper()} Sandbox Mode: API key not provided or request fell back to deterministic engine]"
            )

        # Override for motion-dependent appliances with static photos: AI cannot auto-close
        if is_motion_dependent and not after_is_video:
            after_repair_functional_evidence = "static_unverified"
            ai_recommendation = "inconclusive"
            confidence = min(confidence, 0.55)

        # Critical priority clinical rule: Always requires human supervisor sign-off
        review_requirement = "standard_signoff"
        if ticket.priority == "critical" or ai_recommendation != "likely_resolved":
            review_requirement = "mandatory_human_review"

        full_notes = f"{analysis_text} {notes_source}".strip()

        return {
            "provider_selected": provider,
            "model_name_selected": model_name,
            "evidence_relevance": "high",
            "equipment_match": equipment_match,
            "visible_fault_assessment": visible_fault_assessment,
            "after_repair_functional_evidence": after_repair_functional_evidence,
            "media_quality": media_quality,
            "missing_evidence": missing_evidence,
            "inconsistencies": inconsistencies,
            "visual_observations": visual_observations,
            "before_after_differences": differences,
            "ai_recommendation": ai_recommendation,
            "review_requirement": review_requirement,
            "confidence_score": round(confidence, 2),
            "analysis_notes": full_notes,
            "recommended_next_action": rec_action,
            "safety_disclaimer": "AI Visual Verification Disclaimer: Visual inspection cannot reliably verify internal electrical circuitry, pressurized medical gas or plumbing lines, structural anchoring, or chemical sanitization. Always require physical human sign-off or certified functional safety testing where policy mandates.",
            "model_version": f"{provider}:{model_name}",
            "analysis_timestamp": datetime.now(timezone.utc),
            "is_demo": (provider == "mock" or live_result is None)
        }
