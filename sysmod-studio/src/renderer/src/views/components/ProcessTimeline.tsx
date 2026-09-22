import React from 'react';

export type ProcessStepId = 'design-brief' | 'moscow' | 'decision-matrix' | 'canvas';
type StepStatus = 'completed' | 'active' | 'upcoming';

interface ProcessStepDefinition {
  id: ProcessStepId;
  title: string;
  description: string;
}

const PROCESS_STEPS: ProcessStepDefinition[] = [
  { id: 'design-brief', title: 'Design Brief', description: 'Define the problem and goals' },
  { id: 'moscow', title: 'MoSCoW Table', description: 'Prioritize requirements' },
  { id: 'decision-matrix', title: 'Decision Matrix', description: 'Select the best design' },
  { id: 'canvas', title: 'Architecture Canvas', description: 'Build the system architecture' },
];

interface ProcessTimelineProps {
  currentStep: ProcessStepId;
}

function getStatus(stepIndex: number, currentIndex: number): StepStatus {
  if (stepIndex < currentIndex) return 'completed';
  if (stepIndex === currentIndex) return 'active';
  return 'upcoming';
}

export default function ProcessTimeline({ currentStep }: ProcessTimelineProps): React.JSX.Element {
  const currentIndex = PROCESS_STEPS.findIndex((step) => step.id === currentStep);

  return (
  <div className="@container w-full mb-3!">
    <ul
      className="timeline timeline-compact timeline-horizontal w-full"
      aria-label="Design process progress"
    >
      {PROCESS_STEPS.map((step, index) => {
        const status = getStatus(index, currentIndex);
        const leadingLineColored = index - 1 < currentIndex;
        const trailingLineColored = index < currentIndex;

        return (
          <li key={step.id} className="flex-1">
            {index > 0 && <hr className={leadingLineColored ? 'bg-primary' : undefined} />}

            <div className="timeline-middle">
              {status === 'completed' ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="text-primary h-5 w-5 shrink-0" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className={`h-5 w-5 shrink-0 ${status === 'active' ? 'text-primary' : 'opacity-40'}`}
                  aria-hidden="true"
                >
                  <circle cx="10" cy="10" r="6" />
                </svg>
              )}
            </div>

            <div
              className={`timeline-end w-full text-center min-w-0 -mt-1! ${status === 'active' ? 'font-bold' : status === 'upcoming' ? 'opacity-50' : ''}`}
              aria-current={status === 'active' ? 'step' : undefined}
            >
              <p className="truncate text-[14.5px]">{step.title}</p>
              <p className="hidden @min-[720px]:block text-xs opacity-70 truncate">{step.description}</p>
            </div>

            {index < PROCESS_STEPS.length - 1 && <hr className={trailingLineColored ? 'bg-primary' : undefined} />}
          </li>
        );
      })}
    </ul>
  </div>
  );
}